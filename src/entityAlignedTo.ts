import {
  pairwiseAlignmentProblem,
  pairwiseAlignmentSequenceProblem,
  structureAlignedSeq,
  transcriptAlignedSeq,
} from './mappings.ts'
import { stripStopCodon } from './stripStopCodon.ts'

import type { Entity } from './extractStructureSequences.ts'
import type { PairwiseAlignment } from './mappings.ts'

/**
 * The alignment without the columns that pair a terminal stop codon with a
 * gap, which an alignment made from an unstripped translation ends with. A
 * stop is no residue of the structure, and every coordinate map counts the
 * transcript without it. Returns `pa` itself when there are none.
 */
export function withoutStopColumns(pa: PairwiseAlignment): PairwiseAlignment {
  const t = transcriptAlignedSeq(pa)
  const s = structureAlignedSeq(pa)
  let end = t.length
  while (end > 0 && t[end - 1] === '*' && s[end - 1] === '-') {
    end--
  }
  const [a, b] = pa.alns
  return end === t.length
    ? pa
    : {
        consensus: pa.consensus.slice(0, end),
        alns: [
          { ...a, seq: t.slice(0, end) },
          { ...b, seq: s.slice(0, end) },
        ],
      }
}

/**
 * Which entity an externally supplied alignment describes, or why it
 * describes none: its transcript row has to spell this transcript and its
 * structure row one of the entities. Several chains can spell the same
 * sequence, so `preferredId` wins among them, and a protein chain wins over a
 * nucleic-acid chain of the same letters.
 */
export function entityAlignedTo(
  supplied: PairwiseAlignment,
  transcript: string,
  entities: readonly Entity[],
  preferredId?: string,
): { entityId: string } | { problem: string } {
  const alignment = withoutStopColumns(supplied)
  const t = stripStopCodon(transcript)
  const ownRow = structureAlignedSeq(alignment).replaceAll('-', '')
  const problem =
    pairwiseAlignmentProblem(alignment) ??
    pairwiseAlignmentSequenceProblem(alignment, t, ownRow)
  const rank = (e: Entity) =>
    (e.entityId === preferredId ? 0 : 2) + (e.nucleicAcid ? 1 : 0)
  const match = problem
    ? undefined
    : entities
        .toSorted((a, b) => rank(a) - rank(b))
        .find(
          e =>
            !pairwiseAlignmentSequenceProblem(
              alignment,
              t,
              stripStopCodon(e.seq),
            ),
        )
  return problem
    ? { problem }
    : match
      ? { entityId: match.entityId }
      : {
          problem: `The second sequence (${ownRow.length} residues) is not the sequence of any chain in this structure`,
        }
}
