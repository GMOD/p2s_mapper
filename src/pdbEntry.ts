// What RCSB knows about one PDB entry that a mapping needs, in one GraphQL
// call: each polymer entity's sequence, its author chains, and its alignment
// to UniProt. The alignment is what SIFTS publishes per chain, numbered the
// same way (`entity_beg_seq_id` is label_seq_id, 1-based into the SEQRES),
// and agreed with PDBe's SIFTS on every residue of 23 entries checked
// (2026-10-11, 1TUP, 2RH1, 4HHB, 7K00 among them), in a tenth of the time.

import {
  HttpError,
  isDefinitiveFailure,
  jsonfetch,
  timeout,
} from './fetchUtils.ts'

import type { FetchOptions } from './fetchUtils.ts'
import type {
  UniProtStructureMapping,
  UniProtStructureSegment,
} from './pdbUniProtMapping.ts'

export const RCSB_DATA_GRAPHQL_URL = 'https://data.rcsb.org/graphql'

export interface PdbEntry {
  /** every UniProt accession the entry's entities align to */
  mappings: UniProtStructureMapping[]
  /** one sequence per protein entity, in entity order; nucleic acids left
   * out, since A, C, G, T and U are amino-acid letters too */
  proteinSequences: string[]
}

export function pdbEntryQuery(pdbId: string) {
  return `{ entry(entry_id: "${pdbId.toUpperCase()}") { polymer_entities {
  rcsb_id
  entity_poly { type pdbx_seq_one_letter_code_can }
  rcsb_polymer_entity_container_identifiers { auth_asym_ids }
  rcsb_polymer_entity_align {
    reference_database_name reference_database_accession
    aligned_regions { entity_beg_seq_id ref_beg_seq_id length }
  }
  uniprots { rcsb_id rcsb_uniprot_entry_name }
} } }`
}

const RETRY_DELAYS_MS = [1000, 3000]
// bounded, since a view reports itself loading until the entry answers
const TIMEOUT_MS = 20_000

/**
 * A GraphQL request. The server answers 200 whatever happened, so a failure
 * is read from the body's `errors`, and counts as a 400: the server
 * understood the query and declined it, so asking again gets the same answer.
 */
export async function graphqlFetch(
  url: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  opts?: FetchOptions,
) {
  const json: unknown = await jsonfetch(url, {
    ...opts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const errors = isRecord(json) ? json.errors : undefined
  if (Array.isArray(errors) && errors.length > 0) {
    const first: unknown = errors[0]
    const message =
      isRecord(first) && typeof first.message === 'string'
        ? first.message
        : 'unknown error'
    throw new HttpError(`${new URL(url).host}: ${message}`, 400)
  }
  return isRecord(json) ? json.data : undefined
}

/**
 * The entry, retried twice: one failed request would otherwise leave a fusion
 * construct mapped onto its partner for the whole session. An id RCSB has no
 * entry for is a 404, which is not retried, since that answer cannot change.
 */
export async function fetchPdbEntry(
  pdbId: string,
  opts?: FetchOptions,
): Promise<PdbEntry> {
  const { signal: caller, ...rest } = opts ?? {}
  const signal = caller ?? undefined
  const deadline = () =>
    signal
      ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)])
      : AbortSignal.timeout(TIMEOUT_MS)
  for (let attempt = 0; ; attempt++) {
    try {
      const entry = parsePdbEntry(
        await graphqlFetch(
          RCSB_DATA_GRAPHQL_URL,
          pdbEntryQuery(pdbId),
          undefined,
          { ...rest, signal: deadline() },
        ),
      )
      if (!entry) {
        throw new HttpError(`RCSB has no entry ${pdbId.toUpperCase()}`, 404)
      }
      return entry
    } catch (e) {
      const delay = RETRY_DELAYS_MS[attempt]
      // the caller's own abort is not a failure to retry either
      if (delay === undefined || isDefinitiveFailure(e) || signal?.aborted) {
        throw e
      }
      await timeout(delay, signal)
    }
  }
}

/** The entry's UniProt alignment alone. */
export async function fetchUniProtStructureMappings(
  pdbId: string,
  opts?: FetchOptions,
) {
  return (await fetchPdbEntry(pdbId, opts)).mappings
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : []
}

/**
 * Parses the `data` of `pdbEntryQuery`. Undefined when RCSB has no such
 * entry; an entry nothing aligns to UniProt (DNA alone, say) parses to no
 * mappings. An unparseable alignment is skipped rather than failing the
 * entry, so a chimera with one malformed region still maps its other chains.
 */
export function parsePdbEntry(data: unknown): PdbEntry | undefined {
  const entry = isRecord(data) ? data.entry : undefined
  if (!isRecord(entry)) {
    return undefined
  }
  const entities = Array.isArray(entry.polymer_entities)
    ? entry.polymer_entities.filter(isRecord)
    : []
  const byAccession = new Map<string, UniProtStructureMapping>()
  const proteinSequences: string[] = []
  for (const entity of entities.toSorted(
    (a, b) => entityNumber(a.rcsb_id) - entityNumber(b.rcsb_id),
  )) {
    const entityId = String(entityNumber(entity.rcsb_id))
    const poly = isRecord(entity.entity_poly) ? entity.entity_poly : undefined
    const sequence = poly?.pdbx_seq_one_letter_code_can
    if (
      typeof poly?.type === 'string' &&
      poly.type.startsWith('polypeptide') &&
      typeof sequence === 'string' &&
      sequence.length > 0
    ) {
      proteinSequences.push(sequence)
    }
    const ids = entity.rcsb_polymer_entity_container_identifiers
    const chains = strings(isRecord(ids) ? ids.auth_asym_ids : undefined)
    const names = new Map(
      (Array.isArray(entity.uniprots) ? entity.uniprots : [])
        .filter(isRecord)
        .map(u => [u.rcsb_id, strings(u.rcsb_uniprot_entry_name)[0]] as const),
    )
    for (const align of Array.isArray(entity.rcsb_polymer_entity_align)
      ? entity.rcsb_polymer_entity_align.filter(isRecord)
      : []) {
      const accession = align.reference_database_accession
      if (
        align.reference_database_name !== 'UniProt' ||
        typeof accession !== 'string'
      ) {
        continue
      }
      const segments = (
        Array.isArray(align.aligned_regions) ? align.aligned_regions : []
      ).flatMap(region => parseSegments(region, entityId, chains))
      if (segments.length === 0) {
        continue
      }
      const mapping = byAccession.get(accession) ?? {
        accession,
        name: names.get(accession),
        segments: [],
      }
      mapping.segments.push(...segments)
      byAccession.set(accession, mapping)
    }
  }
  return { mappings: [...byAccession.values()], proteinSequences }
}

function entityNumber(rcsbId: unknown) {
  return typeof rcsbId === 'string' ? Number(rcsbId.split('_')[1]) : NaN
}

/** One segment per chain carrying the entity, so a PDB-format file, whose
 * entities Mol* numbers per chain, still matches by chain. */
function parseSegments(
  region: unknown,
  entityId: string,
  chains: string[],
): UniProtStructureSegment[] {
  if (!isRecord(region)) {
    return []
  }
  const entityBeg = finiteNumber(region.entity_beg_seq_id)
  const refBeg = finiteNumber(region.ref_beg_seq_id)
  const length = finiteNumber(region.length)
  if (
    entityBeg === undefined ||
    refBeg === undefined ||
    length === undefined ||
    length < 1
  ) {
    return []
  }
  const segment = {
    entityId,
    unpStart: refBeg,
    unpEnd: refBeg + length - 1,
    // SEQRES/label_seq_id is 1-based, structure positions are 0-based
    structStart: entityBeg - 1,
    structEnd: entityBeg + length - 2,
  }
  return chains.length === 0
    ? [segment]
    : chains.map(chainId => ({ ...segment, chainId }))
}
