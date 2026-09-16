import { expect, test } from 'vitest'

import { parseExperimentalStructures } from '../src/index.ts'

const beacons = {
  structures: [
    {
      summary: {
        model_identifier: 'AF-P04637-F1',
        model_category: 'AB-INITIO',
        provider: 'AlphaFold DB',
        uniprot_start: 1,
        uniprot_end: 393,
        coverage: 1,
      },
    },
    {
      summary: {
        model_identifier: '9C5S',
        model_category: 'EXPERIMENTALLY DETERMINED',
        provider: 'PDBe',
        experimental_method: 'X-RAY DIFFRACTION',
        resolution: 1.01,
        uniprot_start: 17,
        uniprot_end: 30,
        coverage: 0.036,
      },
    },
    {
      summary: {
        model_identifier: '3d06',
        model_category: 'EXPERIMENTALLY DETERMINED',
        provider: 'PDBe',
        experimental_method: 'X-RAY DIFFRACTION',
        resolution: 1.2,
        uniprot_start: 94,
        uniprot_end: 293,
        coverage: 0.509,
      },
    },
    // SASBDB's small-angle-scattering fits file as experimentally determined
    // too, with a numeric id and near-full coverage: dystrophin's best
    // "structure" by coverage was SASBDB 436, which has no residue mapping.
    {
      summary: {
        model_identifier: '436',
        model_category: 'EXPERIMENTALLY DETERMINED',
        provider: 'SASBDB',
        uniprot_start: 718,
        uniprot_end: 1368,
        coverage: 1,
      },
    },
    {
      summary: {
        model_identifier: '2ocj',
        model_category: 'EXPERIMENTALLY DETERMINED',
        provider: 'PDBe',
        experimental_method: 'X-RAY DIFFRACTION',
        resolution: 2.05,
        uniprot_start: 94,
        uniprot_end: 293,
        coverage: 0.509,
      },
    },
  ],
}

test('PDBe entries only, best coverage first and sharpest within a tie', () => {
  const found = parseExperimentalStructures(beacons)
  expect(found.map(s => s.pdbId)).toEqual(['3d06', '2ocj', '9c5s'])
  expect(found[0]).toEqual({
    pdbId: '3d06',
    method: 'X-RAY DIFFRACTION',
    resolution: 1.2,
    start: 94,
    end: 293,
    coverage: 0.509,
  })
})

test('an NMR entry keeps its place with no resolution to rank by', () => {
  expect(
    parseExperimentalStructures({
      structures: [
        {
          summary: {
            model_identifier: '1DPX',
            model_category: 'EXPERIMENTALLY DETERMINED',
            provider: 'PDBe',
            experimental_method: 'SOLUTION NMR',
            resolution: null,
            uniprot_start: 1,
            uniprot_end: 10,
            coverage: 0.5,
          },
        },
      ],
    }),
  ).toEqual([
    {
      pdbId: '1dpx',
      method: 'SOLUTION NMR',
      resolution: undefined,
      start: 1,
      end: 10,
      coverage: 0.5,
    },
  ])
})

test('an empty or malformed summary is no entries', () => {
  expect(parseExperimentalStructures({})).toEqual([])
  expect(parseExperimentalStructures(null)).toEqual([])
  expect(
    parseExperimentalStructures({ structures: [{}, { summary: 3 }] }),
  ).toEqual([])
})
