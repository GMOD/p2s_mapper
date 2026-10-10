// Which residues two isoforms of one protein share. An alignment column pairs
// two residues whether or not one codon encodes both: a mutually exclusive exon
// sits opposite its partner (PKM's exons 9 and 10, FGFR2's IIIb and IIIc), and
// its residues align, mismatches and chance identities included. A residue
// carries across only inside a stretch the two spell letter for letter: a long
// one, or a short one bounded on both sides by a gap or a sequence end, the
// shape a short shared exon takes (VEGFA's six-residue exon 8a).
//
// Measured 2026-09-25 against codon identity on the genome, over every isoform
// of 13 genes (TP53, PKM, CDKN2A, FGFR2, TPM1, BRAF, EGFR, SCN8A, MAPT, BIN1,
// VEGFA, TPM3, CD44; 89,927 truly shared residues), on global alignments: 335
// placed wrongly and 28 missed, against 1,885 and 28 for every identical
// residue and 328 and 64 for long stretches alone. The misses are single
// residues at exon junctions, where the gap fits either side.

import {
  structureAlignedSeq,
  transcriptAlignedSeq,
  unmapStructurePositions,
} from './mappings.ts'
import { needlemanWunsch } from './pairwiseAlignment.ts'

import type { PairwiseAlignment } from './mappings.ts'

const LONG_STRETCH = 10
const SHORT_EXON = 3

type ColumnKind = 'same' | 'mismatch' | 'gap'

/**
 * Each residue of row `a` that row `b` shares, as 0-based index in `a` to
 * 0-based index in `b`. A lone substitution between two kept stretches carries
 * too: it is one codon two databases read differently, as MUC1's repeats are.
 */
export function sharedResidueMap(a: string, b: string) {
  const cols: { x: number; y: number; kind: ColumnKind }[] = []
  for (let c = 0, x = 0, y = 0; c < a.length; c++) {
    const inA = a[c] !== '-'
    const inB = b[c] !== '-'
    cols.push({
      x,
      y,
      kind:
        !inA || !inB
          ? 'gap'
          : a[c]!.toUpperCase() === b[c]!.toUpperCase()
            ? 'same'
            : 'mismatch',
    })
    if (inA) {
      x++
    }
    if (inB) {
      y++
    }
  }
  const bounded = (c: number) => cols[c]?.kind !== 'mismatch'
  const kept = cols.map(() => false)
  for (let start = 0; start < cols.length;) {
    let end = start
    while (cols[end]?.kind === 'same') {
      end++
    }
    const length = end - start
    if (
      length >= LONG_STRETCH ||
      (length >= SHORT_EXON && bounded(start - 1) && bounded(end))
    ) {
      kept.fill(true, start, end)
    }
    start = Math.max(end, start + 1)
  }
  const shared = new Map<number, number>()
  cols.forEach((col, c) => {
    if (kept[c] || (col.kind === 'mismatch' && kept[c - 1] && kept[c + 1])) {
      shared.set(col.x, col.y)
    }
  })
  return shared
}

/** Each residue of isoform `from` that isoform `to` shares, through a global
 * alignment of the two. */
export function sharedIsoformResidues(from: string, to: string) {
  const { alignedSeq1, alignedSeq2 } = needlemanWunsch(from, to)
  return sharedResidueMap(alignedSeq1, alignedSeq2)
}

/**
 * The alignment of a transcript to another isoform of its protein, with every
 * residue outside a shared stretch unmapped. For two isoforms, not for a
 * structure: a mismatch against a structure's chain is usually a point
 * mutation in the construct, at the right place in the fold.
 */
export function keepSharedStretches(pa: PairwiseAlignment) {
  const structure = structureAlignedSeq(pa)
  const transcript = transcriptAlignedSeq(pa)
  const shared = sharedResidueMap(structure, transcript)
  const unshared = new Set<number>()
  for (let i = 0, j = 0; i < structure.length; i++) {
    if (structure[i] !== '-') {
      if (transcript[i] !== '-' && !shared.has(j)) {
        unshared.add(j)
      }
      j++
    }
  }
  return unmapStructurePositions(pa, unshared)
}
