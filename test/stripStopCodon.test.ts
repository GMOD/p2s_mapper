import { expect, test } from 'vitest'

import {
  sameProtein,
  stripAllStopCodons,
  stripStopCodon,
} from '../src/index.ts'

test('drops the terminal stop codon', () => {
  expect(stripStopCodon('MKAA*')).toBe('MKAA')
  expect(stripStopCodon('MKAA')).toBe('MKAA')
  expect(stripStopCodon('*')).toBe('')
  expect(stripStopCodon('')).toBe('')
})

// The bug: removing every '*' shifted the transcript row of the alignment out of
// step with g2p, whose protein positions are codon indices and still count the
// interior stop. Every genome<->structure hover past that codon was offset.
test('keeps an interior stop codon so downstream positions do not shift', () => {
  expect(stripStopCodon('MK*AA*')).toBe('MK*AA')
  // the residue after the interior stop keeps its codon index
  expect(stripStopCodon('MK*AA*').indexOf('A')).toBe(3)
})

test('stripAllStopCodons removes interior stops too, for search queries', () => {
  expect(stripAllStopCodons('MK*AA*')).toBe('MKAA')
})

test('sameProtein compares translations with their terminal stops aside', () => {
  expect(sameProtein('MKV*', 'MKV')).toBe(true)
  expect(sameProtein('MKV', 'MKVA')).toBe(false)
  expect(sameProtein('*', '')).toBe(false)
})
