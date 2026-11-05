// What a list of PDB entries shows, for a page that lists them before anyone
// opens one: each entry's title, every polymer with its UniProt entries, and
// the small molecules bound to it. One CORS-enabled request for a gene's whole
// list, where `fetchPdbEntry` per entry would be one each.

import { isRecord, strings } from './json.ts'
import { RCSB_DATA_GRAPHQL_URL, graphqlFetch } from './pdbEntry.ts'

import type { FetchOptions } from './fetchUtils.ts'

export interface PdbPolymerEntity {
  /** RCSB's id, "9BTM_1" */
  entityId: string
  /** the depositors' name for it, "Leucine-rich repeat protein SHOC-2" */
  description?: string
  /** RCSB's polymer type: 'Protein', 'DNA', 'RNA', 'NA-hybrid' or 'Other' */
  type?: string
  /** UniProt entries SIFTS maps it to; none for a synthetic peptide, an
   * antibody or a nucleic acid */
  uniprotIds: string[]
  /** author chain ids */
  chains: string[]
}

export interface PdbLigand {
  /** chemical component id, "GDP" */
  id: string
  /** its full name, "GUANOSINE-5'-DIPHOSPHATE" */
  name?: string
}

export interface PdbEntrySummary {
  /** lower case, as `fetchExperimentalStructures` lists it */
  pdbId: string
  /** the entry's title, as deposited: often all capitals */
  title?: string
  polymers: PdbPolymerEntity[]
  /** each component once, in RCSB's order */
  ligands: PdbLigand[]
}

export const PDB_ENTRY_SUMMARIES_QUERY = `query($ids: [String!]!) { entries(entry_ids: $ids) {
  rcsb_id
  struct { title }
  polymer_entities {
    rcsb_id
    rcsb_polymer_entity { pdbx_description }
    entity_poly { rcsb_entity_polymer_type }
    rcsb_polymer_entity_container_identifiers { uniprot_ids auth_asym_ids }
  }
  nonpolymer_entities { nonpolymer_comp { chem_comp { id name } } }
} }`

// a ribosome's entry carries some eighty polymers, so fewer per request than
// the entity details take
const SUMMARIES_BATCH = 300

function text(value: unknown) {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function records(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function polymer(entity: Record<string, unknown>): PdbPolymerEntity[] {
  const entityId = text(entity.rcsb_id)
  const ids = entity.rcsb_polymer_entity_container_identifiers
  const names = entity.rcsb_polymer_entity
  const poly = entity.entity_poly
  return entityId === undefined
    ? []
    : [
        {
          entityId,
          description: isRecord(names)
            ? text(names.pdbx_description)
            : undefined,
          type: isRecord(poly)
            ? text(poly.rcsb_entity_polymer_type)
            : undefined,
          uniprotIds: strings(isRecord(ids) ? ids.uniprot_ids : undefined),
          chains: strings(isRecord(ids) ? ids.auth_asym_ids : undefined),
        },
      ]
}

function ligands(entities: unknown) {
  const byId = new Map<string, PdbLigand>()
  for (const entity of records(entities)) {
    const comp = isRecord(entity.nonpolymer_comp)
      ? entity.nonpolymer_comp.chem_comp
      : undefined
    const id = isRecord(comp) ? text(comp.id) : undefined
    if (id !== undefined && !byId.has(id) && isRecord(comp)) {
      byId.set(id, { id, name: text(comp.name) })
    }
  }
  return [...byId.values()]
}

/**
 * Reads RCSB's answer to `PDB_ENTRY_SUMMARIES_QUERY`, keyed by lower-case PDB
 * id. An entry RCSB does not know is absent from the answer and so from the
 * map.
 */
export function parsePdbEntrySummaries(
  data: unknown,
): Map<string, PdbEntrySummary> {
  const summaries = new Map<string, PdbEntrySummary>()
  for (const entry of records(isRecord(data) ? data.entries : undefined)) {
    const id = text(entry.rcsb_id)
    if (id !== undefined) {
      const pdbId = id.toLowerCase()
      summaries.set(pdbId, {
        pdbId,
        title: isRecord(entry.struct) ? text(entry.struct.title) : undefined,
        polymers: records(entry.polymer_entities).flatMap(polymer),
        ligands: ligands(entry.nonpolymer_entities),
      })
    }
  }
  return summaries
}

/**
 * Title, polymers and ligands of each entry, asked in batches sent together.
 * Ids in either case; the map is keyed in lower case.
 */
export async function fetchPdbEntrySummaries(
  pdbIds: readonly string[],
  opts?: FetchOptions,
): Promise<Map<string, PdbEntrySummary>> {
  const ids = [...new Set(pdbIds.map(id => id.toUpperCase()))]
  const batches = await Promise.all(
    Array.from({ length: Math.ceil(ids.length / SUMMARIES_BATCH) }, (_, i) =>
      graphqlFetch(
        RCSB_DATA_GRAPHQL_URL,
        PDB_ENTRY_SUMMARIES_QUERY,
        { ids: ids.slice(i * SUMMARIES_BATCH, (i + 1) * SUMMARIES_BATCH) },
        opts,
      ),
    ),
  )
  return new Map(batches.flatMap(batch => [...parsePdbEntrySummaries(batch)]))
}

const ISOFORM_SUFFIX = /-\d+$/

/**
 * The polymers of an entry that are not the protein: partner proteins,
 * peptides, antibodies and nucleic acids alike. An entity is the protein when
 * SIFTS maps it to the accession's entry, so a fusion carrying the protein is
 * not a partner of it.
 */
export function pdbEntryPartners(
  summary: PdbEntrySummary,
  uniprotId: string,
): PdbPolymerEntity[] {
  const entry = uniprotId.replace(ISOFORM_SUFFIX, '')
  return summary.polymers.filter(
    p => !p.uniprotIds.some(id => id.replace(ISOFORM_SUFFIX, '') === entry),
  )
}
