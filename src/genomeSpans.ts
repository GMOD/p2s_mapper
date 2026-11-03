import { getCodonRanges } from 'g2p_mapper'

import { structurePos } from './coordinates.ts'

import type { CoordinateMapper } from './coordinates.ts'
import type { ResidueRange } from './residueRuns.ts'

/**
 * Enclosing 0-based half-open [start, end) genome span for a codon.
 * getCodonRanges returns the codon's separate genomic pieces (several when it
 * straddles an exon/intron boundary); this collapses them to the outer span,
 * for navigation. Undefined when the protein position isn't mapped.
 */
export function codonGenomeSpan(
  p2gCodon: Record<number, number[]>,
  proteinPos: number,
): readonly [number, number] | undefined {
  const ranges = getCodonRanges(p2gCodon, proteinPos)
  return ranges && ranges.length > 0
    ? [Math.min(...ranges.map(r => r[0])), Math.max(...ranges.map(r => r[1]))]
    : undefined
}

/**
 * The genome under some residues of a transcript, one 0-based half-open span
 * per stretch of contiguous coding bases, in genome order. A codon split by an
 * intron is two spans, so no band drawn from these crosses the intron.
 */
export function codingSpans(
  p2gCodon: Record<number, number[]>,
  transcriptPositions: Iterable<number>,
) {
  const pieces: [number, number][] = []
  for (const pos of transcriptPositions) {
    pieces.push(...(getCodonRanges(p2gCodon, pos) ?? []))
  }
  const spans: [number, number][] = []
  for (const [start, end] of pieces.toSorted((a, b) => a[0] - b[0])) {
    const last = spans.at(-1)
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      spans.push([start, end])
    }
  }
  return spans
}

/** As codingSpans, for [start, end) ranges of structure positions, through
 * the residues the alignment pairs with the transcript. */
export function structureCodingSpans(
  p2gCodon: Record<number, number[]>,
  mapper: CoordinateMapper,
  ranges: readonly ResidueRange[],
) {
  const transcriptPositions: number[] = []
  for (const range of ranges) {
    for (let pos = range.start; pos < range.end; pos++) {
      const transcript = mapper.structureToTranscript(structurePos(pos))
      if (transcript !== undefined) {
        transcriptPositions.push(transcript)
      }
    }
  }
  return codingSpans(p2gCodon, transcriptPositions)
}
