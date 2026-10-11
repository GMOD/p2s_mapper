import { expect, test } from 'vitest'

import {
  chooseUniProtMappingForEntity,
  fusionPartnerPositions,
  identityUniProtPositionMap,
  makeUniProtPositionMap,
} from '../src/index.ts'

import type { UniProtStructureMapping } from '../src/index.ts'

// 1TUP's p53 chain: SEQRES 1 is UniProt 94, repeated on chains A, B and C
const P53_1TUP: UniProtStructureMapping[] = [
  {
    accession: 'P04637',
    name: 'P53_HUMAN',
    segments: ['A', 'B', 'C'].map(chainId => ({
      entityId: '3',
      chainId,
      unpStart: 94,
      unpEnd: 312,
      structStart: 0,
      structEnd: 218,
    })),
  },
]
const P53_ENTITY = { entityId: '3', chains: ['A', 'B', 'C'] }

test('collapses the repeated chains of a homomer to one segment', () => {
  expect(
    chooseUniProtMappingForEntity(P53_1TUP, P53_ENTITY)?.segments,
  ).toHaveLength(1)
  expect(chooseUniProtMappingForEntity(P53_1TUP, undefined)).toBeUndefined()
  expect(
    chooseUniProtMappingForEntity(P53_1TUP, { entityId: '1', chains: ['E'] }),
  ).toBeUndefined()
})

test('maps p53 uniprot positions onto 1TUP structure positions', () => {
  const mapping = chooseUniProtMappingForEntity(P53_1TUP, P53_ENTITY)
  const map = makeUniProtPositionMap(mapping!.segments)

  // UniProt 94 is the first modeled residue, i.e. structure position 0
  expect(map(94)).toBe(0)
  expect(map(312)).toBe(218)
  // the DNA-binding domain (UniProt 102-292) sits well inside the chain, where
  // the naive position-1 assumption would put it past the 219-residue end
  expect(map(102)).toBe(8)
  expect(map(292)).toBe(198)
  // outside the modeled region
  expect(map(93)).toBeUndefined()
  expect(map(313)).toBeUndefined()
})

test('identity map is used for alphafold models', () => {
  expect(identityUniProtPositionMap(1)).toBe(0)
  expect(identityUniProtPositionMap(250)).toBe(249)
})

test('a segment without a chain matches by entity id', () => {
  const mappings: UniProtStructureMapping[] = [
    {
      accession: 'P1',
      segments: [
        { entityId: '2', unpStart: 1, unpEnd: 9, structStart: 0, structEnd: 8 },
      ],
    },
  ]
  expect(
    chooseUniProtMappingForEntity(mappings, { entityId: '2', chains: ['Z'] })
      ?.accession,
  ).toBe('P1')
  expect(
    chooseUniProtMappingForEntity(mappings, { entityId: '1', chains: ['Z'] }),
  ).toBeUndefined()
})

test('a gapped multi-segment mapping maps each segment by its own offset', () => {
  const map = makeUniProtPositionMap([
    { entityId: '1', unpStart: 10, unpEnd: 20, structStart: 0, structEnd: 10 },
    { entityId: '1', unpStart: 50, unpEnd: 60, structStart: 11, structEnd: 21 },
  ])
  expect(map(10)).toBe(0)
  expect(map(20)).toBe(10)
  expect(map(50)).toBe(11)
  expect(map(60)).toBe(21)
  expect(map(30)).toBeUndefined()
})

// 2RH1: ADRB2 on SEQRES 8-237 and 399-500, T4 lysozyme spliced in at 238-398
// (0-based below). The alignment scattered ICL3 onto the lysozyme.
const SEGMENTS_2RH1 = [
  {
    accession: 'P07550',
    segments: [
      {
        entityId: '1',
        unpStart: 1,
        unpEnd: 230,
        structStart: 7,
        structEnd: 236,
      },
      {
        entityId: '1',
        unpStart: 264,
        unpEnd: 365,
        structStart: 398,
        structEnd: 499,
      },
    ],
  },
  {
    accession: 'P00720',
    segments: [
      {
        entityId: '1',
        unpStart: 2,
        unpEnd: 162,
        structStart: 237,
        structEnd: 397,
      },
    ],
  },
]
const range = (start: number, end: number) =>
  Array.from({ length: end - start }, (_, i) => start + i)
const CHIMERA = { entityId: '1', chains: ['A'] }

/** Mapped positions, each identical to its transcript residue or not. */
function pairs(identical: number[], different: number[] = []) {
  return new Map([
    ...identical.map(p => [p, true] as const),
    ...different.map(p => [p, false] as const),
  ])
}

test('the chimera picks the accession covering the most residues', () => {
  expect(chooseUniProtMappingForEntity(SEGMENTS_2RH1, CHIMERA)?.accession).toBe(
    'P07550',
  )
})

test('unmaps the positions given to the fusion partner, and nothing left unassigned', () => {
  const icl3OnLysozyme = range(237, 270)
  const mapped = pairs([...range(0, 237), ...range(398, 500)], icl3OnLysozyme)
  expect([...fusionPartnerPositions(SEGMENTS_2RH1, CHIMERA, mapped)]).toEqual(
    icl3OnLysozyme,
  )
})

test('a chain with one accession, or another entity, unmaps nothing', () => {
  const mapped = pairs(range(0, 500))
  expect(
    fusionPartnerPositions(SEGMENTS_2RH1.slice(0, 1), CHIMERA, mapped).size,
  ).toBe(0)
  expect(
    fusionPartnerPositions(
      SEGMENTS_2RH1,
      { entityId: '2', chains: ['B'] },
      mapped,
    ).size,
  ).toBe(0)
})

// TP53's 11-residue peptide fused to CDK2: the alignment maps the 11, all
// identical, and 224 chance pairs on the kinase. Counting covered positions
// called CDK2 the transcript's protein and unmapped the peptide.
test("a short product fused to a long partner keeps its residues, and loses the partner's", () => {
  const cdk2 = {
    accession: 'P24941',
    segments: [
      {
        entityId: '1',
        unpStart: 1,
        unpEnd: 298,
        structStart: 0,
        structEnd: 297,
      },
    ],
  }
  const p53 = {
    accession: 'P04637',
    segments: [
      {
        entityId: '1',
        unpStart: 379,
        unpEnd: 389,
        structStart: 310,
        structEnd: 320,
      },
    ],
  }
  const peptide = range(310, 321)
  const chance = range(40, 264)
  const mapped = pairs(
    [...peptide, ...chance.filter(p => p % 5 === 0)],
    chance.filter(p => p % 5 !== 0),
  )
  const partners = fusionPartnerPositions([cdk2, p53], CHIMERA, mapped)
  expect(peptide.some(p => partners.has(p))).toBe(false)
  expect(partners.size).toBe(chance.length)
})

// A PDB-format file whose entity the mapping describes as some other chain,
// or a transcript that is neither protein: no accession reaches half identity
// over what it covers, so none is trusted
test('unmaps nothing when no accession is half identical over what it covers', () => {
  const mapped = pairs(
    range(0, 500).filter(p => p % 4 === 0),
    range(0, 500).filter(p => p % 4 !== 0),
  )
  expect(fusionPartnerPositions(SEGMENTS_2RH1, CHIMERA, mapped).size).toBe(0)
})
