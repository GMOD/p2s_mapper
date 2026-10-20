// The experimental structures RCSB aligns to a UniProt entry: every PDB entity
// carrying the accession, with the UniProt range it covers, then each entry's
// method, resolution and chains. Two CORS-enabled calls, which is what lets a
// page offer a crystal structure beside a prediction without a PDB search of
// its own; take the entry id from here and ask `fetchPdbEntry` for its
// residue mapping.

import { finiteNumber, graphqlString, isRecord, strings } from './json.ts'
import { RCSB_DATA_GRAPHQL_URL, graphqlFetch } from './pdbEntry.ts'
import { isPdbId } from './structureUrls.ts'

import type { FetchOptions } from './fetchUtils.ts'

export const RCSB_SEQUENCE_COORDINATES_URL =
  'https://sequence-coordinates.rcsb.org/graphql'

export interface ExperimentalStructure {
  pdbId: string
  /** RCSB's name for it: 'X-ray', 'EM', 'NMR', ... */
  method: string
  /** Å; absent for NMR and some EM entries */
  resolution?: number
  /** 1-based inclusive UniProt residues the entry covers */
  start: number
  end: number
  /** fraction of the UniProt sequence the entry covers, 0..1 */
  coverage: number
  /** author chain ids of the protein */
  chains: string[]
}

/** One polymer entity aligned to the accession. */
export interface EntityAlignment {
  /** RCSB's id, "1TUP_3" */
  entityId: string
  pdbId: string
  start: number
  end: number
  coverage: number
}

export interface EntityDetails {
  method: string
  resolution?: number
  chains: string[]
}

export function entityAlignmentsQuery(uniprotId: string) {
  return `{ alignments(from: UNIPROT, to: PDB_ENTITY, queryId: ${graphqlString(uniprotId)}) {
  target_alignments {
    target_id
    coverage { query_coverage }
    aligned_regions { query_begin query_end }
  }
} }`
}

export const ENTITY_DETAILS_QUERY = `query($ids: [String!]!) { polymer_entities(entity_ids: $ids) {
  rcsb_id
  rcsb_polymer_entity_container_identifiers { auth_asym_ids }
  entry { rcsb_entry_info { experimental_method resolution_combined } }
} }`

// RCSB's cap on ids per batch request
const DETAILS_BATCH = 1000

/**
 * PDB entities only: the same list carries RCSB's computed models
 * (`AF_AFP04637F1_1`), which a residue mapping does not exist for. The range
 * spans every aligned region, as 3D-Beacons reported it.
 */
export function parseEntityAlignments(data: unknown): EntityAlignment[] {
  const alignments = isRecord(data) ? data.alignments : undefined
  const targets = isRecord(alignments)
    ? alignments.target_alignments
    : undefined
  if (!Array.isArray(targets)) {
    return []
  }
  return targets.flatMap(target => {
    if (!isRecord(target) || typeof target.target_id !== 'string') {
      return []
    }
    const [pdbId] = target.target_id.split('_')
    const coverage = isRecord(target.coverage)
      ? finiteNumber(target.coverage.query_coverage)
      : undefined
    const regions = Array.isArray(target.aligned_regions)
      ? target.aligned_regions.filter(isRecord)
      : []
    const begins = regions.map(r => finiteNumber(r.query_begin))
    const ends = regions.map(r => finiteNumber(r.query_end))
    return pdbId !== undefined &&
      isPdbId(pdbId) &&
      coverage !== undefined &&
      begins.length > 0 &&
      begins.every(b => b !== undefined) &&
      ends.every(e => e !== undefined)
      ? [
          {
            entityId: target.target_id,
            pdbId: pdbId.toLowerCase(),
            start: Math.min(...begins),
            end: Math.max(...ends),
            coverage,
          },
        ]
      : []
  })
}

export function parseEntityDetails(data: unknown): Map<string, EntityDetails> {
  const entities = isRecord(data) ? data.polymer_entities : undefined
  const details = new Map<string, EntityDetails>()
  for (const entity of Array.isArray(entities) ? entities : []) {
    if (!isRecord(entity) || typeof entity.rcsb_id !== 'string') {
      continue
    }
    const ids = entity.rcsb_polymer_entity_container_identifiers
    const info = isRecord(entity.entry)
      ? entity.entry.rcsb_entry_info
      : undefined
    const resolutions = isRecord(info) ? info.resolution_combined : undefined
    const resolution = Array.isArray(resolutions)
      ? finiteNumber(resolutions[0])
      : undefined
    details.set(entity.rcsb_id, {
      method:
        isRecord(info) && typeof info.experimental_method === 'string'
          ? info.experimental_method
          : 'experimental',
      ...(resolution === undefined ? {} : { resolution }),
      chains: strings(isRecord(ids) ? ids.auth_asym_ids : undefined),
    })
  }
  return details
}

/**
 * One row per entry, best coverage first and sharpest within a tie. An entry
 * with several entities of the protein (a construct crystallised beside a
 * different fragment of itself) takes the best-covering entity's range and
 * every entity's chains.
 */
export function experimentalStructures(
  alignments: EntityAlignment[],
  details: ReadonlyMap<string, EntityDetails>,
): ExperimentalStructure[] {
  const byEntry = new Map<string, ExperimentalStructure>()
  for (const a of alignments) {
    const d = details.get(a.entityId)
    if (!d) {
      continue
    }
    const existing = byEntry.get(a.pdbId)
    if (!existing) {
      byEntry.set(a.pdbId, {
        pdbId: a.pdbId,
        method: d.method,
        ...(d.resolution === undefined ? {} : { resolution: d.resolution }),
        start: a.start,
        end: a.end,
        coverage: a.coverage,
        chains: [...d.chains],
      })
      continue
    }
    for (const chain of d.chains) {
      if (!existing.chains.includes(chain)) {
        existing.chains.push(chain)
      }
    }
    if (a.coverage > existing.coverage) {
      Object.assign(existing, {
        start: a.start,
        end: a.end,
        coverage: a.coverage,
      })
    }
  }
  return [...byEntry.values()].sort(
    (a, b) =>
      b.coverage - a.coverage ||
      (a.resolution ?? Infinity) - (b.resolution ?? Infinity),
  )
}

const ISOFORM_SUFFIX = /-\d+$/

/**
 * Every PDB entry aligned to the accession. An accession with none, or one
 * RCSB does not know, is `[]`; an isoform accession is asked as its entry,
 * which is what the alignment is numbered on.
 */
export async function fetchExperimentalStructures(
  uniprotId: string,
  opts?: FetchOptions,
): Promise<ExperimentalStructure[]> {
  const alignments = parseEntityAlignments(
    await graphqlFetch(
      RCSB_SEQUENCE_COORDINATES_URL,
      entityAlignmentsQuery(uniprotId.replace(ISOFORM_SUFFIX, '')),
      undefined,
      opts,
    ),
  )
  const ids = alignments.map(a => a.entityId)
  const details = new Map<string, EntityDetails>()
  for (let i = 0; i < ids.length; i += DETAILS_BATCH) {
    const batch = parseEntityDetails(
      await graphqlFetch(
        RCSB_DATA_GRAPHQL_URL,
        ENTITY_DETAILS_QUERY,
        { ids: ids.slice(i, i + DETAILS_BATCH) },
        opts,
      ),
    )
    for (const [id, d] of batch) {
      details.set(id, d)
    }
  }
  return experimentalStructures(alignments, details)
}
