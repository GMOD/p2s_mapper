import { expect, test } from 'vitest'

import {
  parseUniProtStructureMappings,
  segmentsForAccession,
  toAuthorRange,
} from '../src/index.ts'

// 2HHB as PDBe serves it: both haemoglobin chains number from the mature
// protein, one behind UniProt.
const segment = (
  chain: string,
  author: [number, number],
  unp: [number, number],
) => ({
  chain_id: chain,
  start: { residue_number: 1, author_residue_number: author[0] },
  end: {
    residue_number: author[1] - author[0] + 1,
    author_residue_number: author[1],
  },
  unp_start: unp[0],
  unp_end: unp[1],
  entity_id: 1,
})

const hhb = {
  '2hhb': {
    UniProt: {
      P68871: {
        name: 'HBB_HUMAN',
        mappings: [
          segment('B', [1, 146], [2, 147]),
          segment('D', [1, 146], [2, 147]),
        ],
      },
      P69905: {
        name: 'HBA_HUMAN',
        mappings: [segment('A', [1, 141], [2, 142])],
      },
    },
  },
}

const hbb = () =>
  segmentsForAccession(parseUniProtStructureMappings(hhb), 'P68871')

test('segmentsForAccession: the named accession only', () => {
  expect(hbb().map(s => s.chainId)).toEqual(['B', 'D'])
  expect(
    segmentsForAccession(parseUniProtStructureMappings(hhb), 'Q00000'),
  ).toEqual([])
})

test('toAuthorRange: Glu7 of the translation is Glu6 in the crystal', () => {
  expect(toAuthorRange(hbb(), { start: 7, end: 7 })).toEqual({
    start: 6,
    end: 6,
    chain: 'B',
    shift: -1,
  })
})

test('toAuthorRange: the range is clipped to the segment, and a miss is undefined', () => {
  expect(toAuthorRange(hbb(), { start: 1, end: 10 })).toEqual({
    start: 1,
    end: 9,
    chain: 'B',
    shift: -1,
  })
  expect(toAuthorRange(hbb(), { start: 150, end: 160 })).toBe(undefined)
})

test('toAuthorRange: the segment covering most of the range decides', () => {
  const segments = [
    {
      entityId: '1',
      chainId: 'A',
      unpStart: 1,
      unpEnd: 50,
      structStart: 0,
      structEnd: 49,
      authorStart: 101,
      authorEnd: 150,
    },
    {
      entityId: '1',
      chainId: 'A',
      unpStart: 51,
      unpEnd: 150,
      structStart: 50,
      structEnd: 149,
      authorStart: 201,
      authorEnd: 300,
    },
  ]
  expect(toAuthorRange(segments, { start: 40, end: 120 })).toEqual({
    start: 201,
    end: 270,
    chain: 'A',
    shift: 150,
  })
})

test('toAuthorRange: a segment SIFTS gave no author numbers cannot shift', () => {
  const segments = parseUniProtStructureMappings({
    '1abc': {
      UniProt: {
        P1: {
          mappings: [
            {
              chain_id: 'A',
              entity_id: 1,
              start: { residue_number: 1, author_residue_number: null },
              end: { residue_number: 10, author_residue_number: null },
              unp_start: 1,
              unp_end: 10,
            },
          ],
        },
      },
    },
  })
  expect(segmentsForAccession(segments, 'P1')).toHaveLength(1)
  expect(
    toAuthorRange(segmentsForAccession(segments, 'P1'), { start: 1, end: 5 }),
  ).toBe(undefined)
})
