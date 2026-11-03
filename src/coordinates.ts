import {
  structurePositionToAlignmentMap,
  structureSeqVsTranscriptSeqMap,
  transcriptPositionToAlignmentMap,
} from './mappings.ts'
import { invertMap } from './invertMap.ts'

import type { PairwiseAlignment } from './mappings.ts'

/**
 * Branded coordinate spaces. Every position is a plain `number` at runtime, but
 * a structure residue index, a transcript residue index and an alignment column
 * mean different things, and mixing them causes off-by-one bugs. The brands
 * make the compiler reject mixing; wrap a raw number with the helpers below
 * where it enters, such as a molstar pick, a hover event or a feature.
 *
 * All are 0-based. StructurePos indexes the ungapped structure sequence,
 * TranscriptPos the ungapped transcript sequence, and AlignmentCol a column of
 * the pairwise alignment, gaps included.
 */
export type StructurePos = number & { readonly __brand: 'StructurePos' }
export type TranscriptPos = number & { readonly __brand: 'TranscriptPos' }
export type AlignmentCol = number & { readonly __brand: 'AlignmentCol' }

export const structurePos = (n: number) => n as StructurePos
export const transcriptPos = (n: number) => n as TranscriptPos
export const alignmentCol = (n: number) => n as AlignmentCol

export interface CoordinateMaps {
  structureSeqToTranscriptSeqPosition: Record<number, number>
  transcriptSeqToStructureSeqPosition: Record<number, number>
  structurePositionToAlignmentMap: Record<number, number>
  transcriptPositionToAlignmentMap: Record<number, number>
  alignmentToStructurePosition: Record<number, number>
  alignmentToTranscriptPosition: Record<number, number>
}

export interface CoordinateMapper {
  structureToTranscript: (p: StructurePos) => TranscriptPos | undefined
  transcriptToStructure: (p: TranscriptPos) => StructurePos | undefined
  structureToAlignment: (p: StructurePos) => AlignmentCol | undefined
  alignmentToStructure: (c: AlignmentCol) => StructurePos | undefined
  transcriptToAlignment: (p: TranscriptPos) => AlignmentCol | undefined
  alignmentToTranscript: (c: AlignmentCol) => TranscriptPos | undefined
  /**
   * The lookup tables as plain numbers, for code that iterates a whole map,
   * such as drawing a per-residue track or selecting every aligned residue.
   * Use the typed methods above to convert one position.
   */
  readonly maps: CoordinateMaps
}

/**
 * Builds every coordinate conversion once from a pairwise alignment, replacing
 * the scatter of per-getter map builds + repeated invertMap calls. The branded
 * methods are the preferred API; `maps` stays unbranded for whole-map consumers.
 */
export function makeCoordinateMapper(
  pairwiseAlignment: PairwiseAlignment,
): CoordinateMapper {
  const {
    structureSeqToTranscriptSeqPosition,
    transcriptSeqToStructureSeqPosition,
  } = structureSeqVsTranscriptSeqMap(pairwiseAlignment)
  const s2aln = structurePositionToAlignmentMap(pairwiseAlignment)
  const t2aln = transcriptPositionToAlignmentMap(pairwiseAlignment)
  const aln2s = invertMap(s2aln)
  const aln2t = invertMap(t2aln)

  // The `as` casts below are the single brand-crossing point: indexing a
  // Record<number,number> yields a plain number that we re-brand to its output
  // space. Isolated here so the rest of the codebase stays brand-clean.
  return {
    structureToTranscript: p =>
      structureSeqToTranscriptSeqPosition[p] as TranscriptPos | undefined,
    transcriptToStructure: p =>
      transcriptSeqToStructureSeqPosition[p] as StructurePos | undefined,
    structureToAlignment: p => s2aln[p] as AlignmentCol | undefined,
    alignmentToStructure: c => aln2s[c] as StructurePos | undefined,
    transcriptToAlignment: p => t2aln[p] as AlignmentCol | undefined,
    alignmentToTranscript: c => aln2t[c] as TranscriptPos | undefined,
    maps: {
      structureSeqToTranscriptSeqPosition,
      transcriptSeqToStructureSeqPosition,
      structurePositionToAlignmentMap: s2aln,
      transcriptPositionToAlignmentMap: t2aln,
      alignmentToStructurePosition: aln2s,
      alignmentToTranscriptPosition: aln2t,
    },
  }
}
