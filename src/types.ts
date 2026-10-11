export type AlignmentAlgorithm = 'needleman_wunsch' | 'smith_waterman'

export const ALIGNMENT_ALGORITHMS = {
  NEEDLEMAN_WUNSCH: 'needleman_wunsch',
  SMITH_WATERMAN: 'smith_waterman',
} as const

export const DEFAULT_ALIGNMENT_ALGORITHM: AlignmentAlgorithm = 'smith_waterman'

export const ALIGNMENT_ALGORITHM_VALUES: AlignmentAlgorithm[] = [
  'needleman_wunsch',
  'smith_waterman',
]

/** Parses an untrusted algorithm name, such as a URL parameter, falling back
 * to Smith-Waterman. */
export function coerceAlignmentAlgorithm(value: string): AlignmentAlgorithm {
  return (
    ALIGNMENT_ALGORITHM_VALUES.find(v => v === value) ??
    DEFAULT_ALIGNMENT_ALGORITHM
  )
}

export const ALIGNMENT_ALGORITHM_LABELS: Record<AlignmentAlgorithm, string> = {
  needleman_wunsch: 'Needleman-Wunsch',
  smith_waterman: 'Smith-Waterman',
}
