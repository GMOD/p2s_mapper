import { stripStopCodon } from './stripStopCodon.ts'
import {
  alignTranscriptToEntity,
  chooseMappedEntity,
} from './chooseMappedEntity.ts'

/** A transcript isoform, named by whatever id the caller ranks by. `seq` is its
 * translation, absent when none could be computed. */
export interface Isoform {
  id: string
  seq?: string
}

export interface RankedIsoform {
  id: string
  length: number
  /** identical residues against the structure, for an isoform that does not
   * match it exactly; undefined with no structure to compare to */
  identical?: number
  /** that alignment's score, which is what ranks non-matching isoforms */
  score?: number
}

export interface ClassifiedIsoforms {
  // protein matches the structure residues, longest first
  matches: RankedIsoform[]
  // has a protein sequence but doesn't match the structure, best-aligning first
  nonMatches: RankedIsoform[]
  // ids of the isoforms no protein sequence could be computed for
  noData: string[]
}

// The picker re-ranks on every render and each non-exact isoform costs an
// O(len²) alignment, so results are cached by sequence pair: a titin-sized
// isoform against a long chain is a second of main-thread work each time.
const alignmentCache = new Map<string, { identical: number; score: number }>()
const ALIGNMENT_CACHE_LIMIT = 200

function alignToStructure(isoform: string, structure: string) {
  const key = `${isoform}\n${structure}`
  let result = alignmentCache.get(key)
  if (result === undefined) {
    const scored = alignTranscriptToEntity(isoform, structure, 'smith_waterman')
    result = { identical: scored?.matches ?? 0, score: scored?.score ?? 0 }
    if (alignmentCache.size >= ALIGNMENT_CACHE_LIMIT) {
      alignmentCache.clear()
    }
    alignmentCache.set(key, result)
  }
  return result
}

/**
 * The single rule for ranking transcript isoforms against a structure, shared
 * by a picker UI and an auto-selection. An isoform whose translation is the
 * structure's sequence wins outright. Among the rest, the best alignment score
 * comes first, then the most identical residues, then length.
 *
 * The score has to lead: an isoform carrying an exon the structure lacks
 * aligns every structure residue too, across a gap, so it ties on identical
 * residues with the isoform the structure was made from (1MH1 against Rac1
 * and Rac1b).
 */
export function classifyIsoforms({
  isoforms,
  structureSequence,
}: {
  isoforms: readonly Isoform[]
  structureSequence?: string
}): ClassifiedIsoforms {
  const matches: RankedIsoform[] = []
  const nonMatches: RankedIsoform[] = []
  const noData: string[] = []
  const structure = structureSequence
    ? stripStopCodon(structureSequence)
    : undefined
  for (const { id, seq } of isoforms) {
    if (seq === undefined) {
      noData.push(id)
    } else if (structure && stripStopCodon(seq) === structure) {
      matches.push({ id, length: seq.length })
    } else {
      nonMatches.push({
        id,
        length: seq.length,
        ...(structure ? alignToStructure(seq, structure) : {}),
      })
    }
  }
  const byLengthDesc = (a: RankedIsoform, b: RankedIsoform) =>
    b.length - a.length
  const byAlignmentThenLength = (a: RankedIsoform, b: RankedIsoform) =>
    (b.score ?? 0) - (a.score ?? 0) ||
    (b.identical ?? 0) - (a.identical ?? 0) ||
    byLengthDesc(a, b)
  return {
    matches: matches.toSorted(byLengthDesc),
    nonMatches: nonMatches.toSorted(byAlignmentThenLength),
    noData,
  }
}

/** The id of the isoform to open, by the ranking above. */
export function selectBestTranscript(args: {
  isoforms: readonly Isoform[]
  structureSequence?: string
}) {
  const { matches, nonMatches } = classifyIsoforms(args)
  return (matches[0] ?? nonMatches[0])?.id
}

/**
 * Which of a structure's protein chains isoforms are compared against: one some
 * isoform translates to exactly, else the chain `chooseMappedEntity` would map
 * the longest isoform to, never simply the first (CDK2, on 1H26).
 * `structureSequences` must hold protein chains only.
 */
export function pickStructureSequence(
  structureSequences: string[] | undefined,
  isoforms: readonly Isoform[] | undefined,
): string | undefined {
  const translations = (isoforms ?? []).flatMap(({ seq }) =>
    seq === undefined ? [] : [stripStopCodon(seq)],
  )
  const translated = new Set(translations)
  const exact = structureSequences?.find(s => translated.has(stripStopCodon(s)))
  const longest = translations.reduce<string | undefined>(
    (a, b) => (a !== undefined && a.length >= b.length ? a : b),
    undefined,
  )
  const aligned =
    structureSequences && longest
      ? chooseMappedEntity(longest, structureSequences, 'smith_waterman')
      : undefined
  return (
    exact ??
    (aligned ? structureSequences?.[aligned.index] : structureSequences?.[0])
  )
}
