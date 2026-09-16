// How a PDB entry numbers the residues of a UniProt sequence. Author numbering
// is what a paper cites and what a viewer lights a named residue by, and it is
// not the UniProt numbering for every entry: haemoglobin's chains number from
// the mature protein, so author residue 1 is UniProt residue 2 (2HHB, measured
// 2026-09-12). SIFTS records the correspondence per chain segment, and
// `fetchUniProtStructureMappings` is what asks PDBe for it.

import type { UniProtStructureSegment } from './pdbUniProtMapping.ts'

export interface AuthorRange {
  start: number
  end: number
  chain: string
  /** author number minus UniProt number in the chosen segment */
  shift: number
}

/** The segments SIFTS gives one accession, chain ids and author numbers
 * included, out of a whole entry's mappings. */
export function segmentsForAccession(
  mappings: readonly {
    accession: string
    segments: UniProtStructureSegment[]
  }[],
  accession: string,
) {
  return mappings.find(m => m.accession === accession)?.segments ?? []
}

/**
 * The author-numbered range a UniProt range is cited by in the entry: the
 * segment overlapping most of the range decides the shift. Undefined when no
 * chain of the entry covers any of it, or when SIFTS named no author numbers.
 */
export function toAuthorRange(
  segments: readonly UniProtStructureSegment[],
  range: { start: number; end: number },
): AuthorRange | undefined {
  const overlap = (s: UniProtStructureSegment) =>
    Math.min(s.unpEnd, range.end) - Math.max(s.unpStart, range.start) + 1
  const best = segments
    .flatMap(s => {
      const { chainId, authorStart, unpStart, unpEnd } = s
      return chainId !== undefined &&
        authorStart !== undefined &&
        overlap(s) > 0
        ? [{ chainId, authorStart, unpStart, unpEnd, overlap: overlap(s) }]
        : []
    })
    .toSorted((a, b) => b.overlap - a.overlap)[0]
  if (!best) {
    return undefined
  }
  const shift = best.authorStart - best.unpStart
  return {
    start: Math.max(range.start, best.unpStart) + shift,
    end: Math.min(range.end, best.unpEnd) + shift,
    chain: best.chainId,
    shift,
  }
}
