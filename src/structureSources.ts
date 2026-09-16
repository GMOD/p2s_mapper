// The experimental structures 3D-Beacons knows for a UniProt entry: every PDBe
// entry mapped to the accession, with the UniProt range it covers and its
// resolution, in one CORS-enabled call. That is what lets a page offer a
// crystal structure beside a prediction without a PDB search of its own; take
// the entry id from here and ask `fetchUniProtStructureMappings` for its
// residue mapping.

import { rawfetch } from './fetchUtils.ts'

import type { FetchOptions } from './fetchUtils.ts'

export interface ExperimentalStructure {
  pdbId: string
  method: string
  /** Å; absent for NMR and some EM entries */
  resolution?: number
  /** 1-based inclusive UniProt residues the entry covers */
  start: number
  end: number
  /** fraction of the UniProt sequence the entry covers, 0..1 */
  coverage: number
}

export function beaconsSummaryUrl(uniprotId: string) {
  return `https://www.ebi.ac.uk/pdbe/pdbe-kb/3dbeacons/api/uniprot/summary/${encodeURIComponent(uniprotId)}.json?provider=pdbe`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * PDBe entries only, best-covering first and sharpest within a tie.
 *
 * Predicted entries (AlphaFold, SWISS-MODEL, AlphaFill) are left out because a
 * prediction comes from AlphaFold's own API, which answers per model. And
 * 3D-Beacons files SASBDB's small-angle-scattering fits under "experimentally
 * determined" too, with numeric ids and near-full coverage — dystrophin's best
 * "structure" by coverage was SASBDB 436 — which are not entries a residue
 * mapping exists for. Hence the `provider === 'PDBe'` gate rather than the
 * category alone.
 */
export function parseExperimentalStructures(
  json: unknown,
): ExperimentalStructure[] {
  const structures = isRecord(json) ? json.structures : undefined
  if (!Array.isArray(structures)) {
    return []
  }
  return structures
    .flatMap(entry => {
      const s = isRecord(entry) ? entry.summary : undefined
      if (!isRecord(s)) {
        return []
      }
      const start = finiteNumber(s.uniprot_start)
      const end = finiteNumber(s.uniprot_end)
      const coverage = finiteNumber(s.coverage)
      return typeof s.model_identifier === 'string' &&
        s.provider === 'PDBe' &&
        s.model_category === 'EXPERIMENTALLY DETERMINED' &&
        start !== undefined &&
        end !== undefined &&
        coverage !== undefined
        ? [
            {
              pdbId: s.model_identifier.toLowerCase(),
              method:
                typeof s.experimental_method === 'string'
                  ? s.experimental_method
                  : 'experimental',
              resolution: finiteNumber(s.resolution),
              start,
              end,
              coverage,
            },
          ]
        : []
    })
    .sort(
      (a, b) =>
        b.coverage - a.coverage ||
        (a.resolution ?? Infinity) - (b.resolution ?? Infinity),
    )
}

/** Best-effort: an unreachable API reads as "no entries", which costs a
 * structure suggestion and nothing else. */
export async function fetchExperimentalStructures(
  uniprotId: string,
  opts?: FetchOptions,
): Promise<ExperimentalStructure[]> {
  const res = await rawfetch(beaconsSummaryUrl(uniprotId), opts).catch(
    () => undefined,
  )
  return res?.ok ? parseExperimentalStructures(await res.json()) : []
}
