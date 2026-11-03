import { residueNumber } from './extractStructureSequences.ts'

import type { CoordinateMapper } from './coordinates.ts'
import type { Entity } from './extractStructureSequences.ts'

export interface ResidueRange {
  start: number
  end: number
}

/** One range, or several: the form a selection takes. */
export type ResidueRanges = ResidueRange | readonly ResidueRange[]

export function rangeList(ranges: ResidueRanges | undefined) {
  return ranges === undefined ? [] : 'start' in ranges ? [ranges] : ranges
}

/** Collapse a set of positions into sorted, contiguous [start, end) runs. */
export function positionRuns(positions: Iterable<number>) {
  const sorted = [...new Set(positions)].sort((a, b) => a - b)
  const runs: ResidueRange[] = []
  for (const pos of sorted) {
    const last = runs.at(-1)
    if (last?.end === pos) {
      last.end = pos + 1
    } else {
      runs.push({ start: pos, end: pos + 1 })
    }
  }
  return runs
}

/**
 * The 0-based [start, end) runs of positions whose author residue number, the
 * form a paper names a site by ("R248", "residues 102-292"), falls in any of
 * the inclusive ranges. A fusion numbers its partner apart (2RH1's lysozyme is
 * 1002–1161), so a range across the fusion site selects the receptor on both
 * sides and not the partner between. Empty when no residue carries a number
 * in the ranges, so a typo selects nothing rather than something else.
 */
export function residueRuns(entity: Entity | undefined, ranges: ResidueRanges) {
  const list = rangeList(ranges)
  const positions: number[] = []
  for (let pos = 0; pos < (entity?.seq.length ?? 0); pos++) {
    const n = residueNumber(entity, pos)
    if (list.some(r => n >= r.start && n <= r.end)) {
      positions.push(pos)
    }
  }
  return positionRuns(positions)
}

/**
 * The runs of structure positions the alignment pairs with any of the
 * inclusive ranges of 1-based transcript residues, the numbering a UniProt
 * feature or a domain map uses. A structure residue the transcript lacks, an
 * inserted tag or a fusion partner SIFTS unmaps, splits the run rather than
 * being selected.
 */
export function transcriptRuns(
  mapper: CoordinateMapper,
  ranges: ResidueRanges,
) {
  const list = rangeList(ranges)
  const positions: number[] = []
  for (const [transcript, structure] of Object.entries(
    mapper.maps.transcriptSeqToStructureSeqPosition,
  )) {
    const residue = Number(transcript) + 1
    if (list.some(r => residue >= r.start && residue <= r.end)) {
      positions.push(structure)
    }
  }
  return positionRuns(positions)
}

/** Sorted [start, end) runs covering the ranges, overlaps and neighbours
 * merged. */
export function positionRangeRuns(ranges: ResidueRanges) {
  const runs: ResidueRange[] = []
  for (const { start, end } of rangeList(ranges)
    .filter(r => r.end > r.start)
    .toSorted((a, b) => a.start - b.start)) {
    const last = runs.at(-1)
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end)
    } else {
      runs.push({ start, end })
    }
  }
  return runs
}
