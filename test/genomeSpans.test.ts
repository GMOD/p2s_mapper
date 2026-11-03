import { expect, test } from 'vitest'

import {
  codingSpans,
  codonGenomeSpan,
  makeCoordinateMapper,
  structureCodingSpans,
} from '../src/index.ts'

// codon 0 at 100-102, codon 1 split by an intron (103, then 200-201), codon 2
// at 202-204
const p2gCodon = {
  0: [100, 101, 102],
  1: [103, 200, 201],
  2: [202, 203, 204],
}

test('codonGenomeSpan encloses a split codon', () => {
  expect(codonGenomeSpan(p2gCodon, 1)).toEqual([103, 202])
  expect(codonGenomeSpan(p2gCodon, 9)).toBeUndefined()
})

test('codingSpans does not cross the intron', () => {
  expect(codingSpans(p2gCodon, [2, 0, 1])).toEqual([
    [100, 104],
    [200, 205],
  ])
  expect(codingSpans(p2gCodon, [])).toEqual([])
})

test('structureCodingSpans goes through the residues the alignment pairs', () => {
  // structure residue 1 is an insert the transcript lacks
  const mapper = makeCoordinateMapper({
    consensus: '',
    alns: [
      { id: 'a', seq: 'M-KV' },
      { id: 'b', seq: 'MGKV' },
    ],
  })
  expect(
    structureCodingSpans(p2gCodon, mapper, [{ start: 0, end: 2 }]),
  ).toEqual([[100, 103]])
  expect(
    structureCodingSpans(p2gCodon, mapper, [{ start: 1, end: 4 }]),
  ).toEqual([
    [103, 104],
    [200, 205],
  ])
})
