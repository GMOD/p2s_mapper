import { expect, test } from 'vitest'

import {
  locateGenomeBase,
  locateStructureResidue,
  locateTranscriptResidue,
  makeCoordinateMapper,
} from '../src/index.ts'

import type { ResidueMapping } from '../src/index.ts'

// structure position 1 (G) is an insert the transcript lacks, and transcript
// residue 3 (L) is past the structure's end
const mapper = makeCoordinateMapper({
  consensus: '',
  alns: [
    { id: 'transcript', seq: 'M-KVL' },
    { id: 'structure', seq: 'MGKV-' },
  ],
})

const entity = {
  entityId: '1',
  seq: 'MGKV',
  seqIds: [1, 2, 3, 4],
  authSeqIds: [101, 102, 103, 104],
  chains: ['A', 'B'],
}

// minus strand: codon 1 split by an intron, 200 then 109..108
const mapping: ResidueMapping = {
  entity,
  mapper,
  transcript: 'MKVL',
  genome: {
    refName: 'chr1',
    g2p: { 212: 0, 211: 0, 210: 0, 200: 1, 109: 1, 108: 1, 107: 2 },
    p2gCodon: {
      0: [212, 211, 210],
      1: [200, 109, 108],
      2: [107, 106, 105],
      3: [104, 103, 102],
    },
  },
}

test('a structure residue in every numbering', () => {
  expect(locateStructureResidue(mapping, 2)).toEqual({
    position: 2,
    residue: 103,
    labelSeqId: 3,
    chains: ['A', 'B'],
    structureLetter: 'K',
    transcriptResidue: 2,
    transcriptLetter: 'K',
    codon: { refName: 'chr1', start: 108, end: 201 },
    locus: 'chr1:109-201',
  })
})

test('an inserted structure residue has no transcript side', () => {
  expect(locateStructureResidue(mapping, 1)).toEqual({
    position: 1,
    residue: 102,
    labelSeqId: 2,
    chains: ['A', 'B'],
    structureLetter: 'G',
  })
  expect(locateStructureResidue(mapping, 4)).toBeUndefined()
})

test('a transcript residue the structure lacks has no structure side', () => {
  expect(locateTranscriptResidue(mapping, 3)).toEqual({
    transcriptResidue: 4,
    transcriptLetter: 'L',
    codon: { refName: 'chr1', start: 102, end: 105 },
    locus: 'chr1:103-105',
  })
  expect(locateTranscriptResidue(mapping, 4)).toBeUndefined()
})

test('a genome base reaches the residue its codon makes', () => {
  expect(locateGenomeBase(mapping, 109)?.residue).toBe(103)
  expect(locateGenomeBase(mapping, 150)).toBeUndefined()
})

test('a structure with no genome still pairs residues', () => {
  const { genome: _, ...noGenome } = mapping
  expect(locateStructureResidue(noGenome, 0)).toEqual({
    position: 0,
    residue: 101,
    labelSeqId: 1,
    chains: ['A', 'B'],
    structureLetter: 'M',
    transcriptResidue: 1,
    transcriptLetter: 'M',
  })
  expect(locateGenomeBase(noGenome, 212)).toBeUndefined()
})
