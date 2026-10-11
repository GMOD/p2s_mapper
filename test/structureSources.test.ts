import { expect, test, vi } from 'vitest'

import {
  ENTITY_DETAILS_QUERY,
  entityAlignmentsQuery,
  experimentalStructures,
  fetchExperimentalStructures,
  parseEntityAlignments,
  parseEntityDetails,
} from '../src/index.ts'

// Abridged from https://sequence-coordinates.rcsb.org/graphql for P04637: the
// p53 core on DNA (1TUP), the full-length cryo-EM entry, the peptide on CDK2
// (1H26), and RCSB's own AlphaFold model, which is not a PDB entry.
const ALIGNMENTS = {
  alignments: {
    target_alignments: [
      {
        target_id: '1TUP_3',
        coverage: { query_coverage: 0.557 },
        aligned_regions: [
          { query_begin: 94, query_end: 312, target_begin: 1, target_end: 219 },
        ],
      },
      {
        target_id: '8R1F_3',
        coverage: { query_coverage: 1 },
        aligned_regions: [
          { query_begin: 1, query_end: 393, target_begin: 1, target_end: 393 },
        ],
      },
      {
        target_id: '1H26_3',
        coverage: { query_coverage: 0.028 },
        aligned_regions: [
          { query_begin: 376, query_end: 386, target_begin: 1, target_end: 11 },
        ],
      },
      // the receptor in two regions around a fusion partner
      {
        target_id: '2RH1_1',
        coverage: { query_coverage: 0.8 },
        aligned_regions: [
          { query_begin: 1, query_end: 230, target_begin: 8, target_end: 237 },
          {
            query_begin: 264,
            query_end: 365,
            target_begin: 399,
            target_end: 500,
          },
        ],
      },
      {
        target_id: 'AF_AFP04637F1_1',
        coverage: { query_coverage: 1 },
        aligned_regions: [
          { query_begin: 1, query_end: 393, target_begin: 1, target_end: 393 },
        ],
      },
      { target_id: '9BAD_1', coverage: {}, aligned_regions: [] },
    ],
  },
}

const DETAILS = {
  polymer_entities: [
    {
      rcsb_id: '1TUP_3',
      rcsb_polymer_entity_container_identifiers: {
        auth_asym_ids: ['A', 'B', 'C'],
      },
      entry: {
        rcsb_entry_info: {
          experimental_method: 'X-ray',
          resolution_combined: [2.2],
        },
      },
    },
    {
      rcsb_id: '8R1F_3',
      rcsb_polymer_entity_container_identifiers: { auth_asym_ids: ['C'] },
      entry: {
        rcsb_entry_info: {
          experimental_method: 'EM',
          resolution_combined: [3.1],
        },
      },
    },
    {
      rcsb_id: '1H26_3',
      rcsb_polymer_entity_container_identifiers: { auth_asym_ids: ['E', 'F'] },
      entry: {
        rcsb_entry_info: {
          experimental_method: 'X-ray',
          resolution_combined: [2.24],
        },
      },
    },
    {
      rcsb_id: '2RH1_1',
      rcsb_polymer_entity_container_identifiers: { auth_asym_ids: ['A'] },
      entry: {
        rcsb_entry_info: {
          experimental_method: 'NMR',
          resolution_combined: null,
        },
      },
    },
  ],
}

test('PDB entities only, each spanning all its aligned regions', () => {
  const found = parseEntityAlignments(ALIGNMENTS)
  expect(found.map(a => a.entityId)).toEqual([
    '1TUP_3',
    '8R1F_3',
    '1H26_3',
    '2RH1_1',
  ])
  expect(found[0]).toEqual({
    entityId: '1TUP_3',
    pdbId: '1tup',
    start: 94,
    end: 312,
    coverage: 0.557,
  })
  expect(found[3]).toMatchObject({ start: 1, end: 365 })
})

test('details carry method, chains, and a resolution only where one exists', () => {
  const details = parseEntityDetails(DETAILS)
  expect(details.get('1TUP_3')).toEqual({
    method: 'X-ray',
    resolution: 2.2,
    chains: ['A', 'B', 'C'],
  })
  expect(details.get('2RH1_1')).toEqual({ method: 'NMR', chains: ['A'] })
})

test('one row per entry, best coverage first and sharpest within a tie', () => {
  const found = experimentalStructures(
    parseEntityAlignments(ALIGNMENTS),
    parseEntityDetails(DETAILS),
  )
  expect(found.map(s => s.pdbId)).toEqual(['8r1f', '2rh1', '1tup', '1h26'])
  expect(found[2]).toEqual({
    pdbId: '1tup',
    method: 'X-ray',
    resolution: 2.2,
    start: 94,
    end: 312,
    coverage: 0.557,
    chains: ['A', 'B', 'C'],
  })
  expect(found[1]).not.toHaveProperty('resolution')
})

test('two entities of one entry merge: the better-covering range, every chain', () => {
  const found = experimentalStructures(
    [
      { entityId: '1ABC_1', pdbId: '1abc', start: 1, end: 50, coverage: 0.5 },
      { entityId: '1ABC_2', pdbId: '1abc', start: 1, end: 90, coverage: 0.9 },
    ],
    new Map([
      ['1ABC_1', { method: 'X-ray', resolution: 1.5, chains: ['A'] }],
      ['1ABC_2', { method: 'X-ray', resolution: 1.5, chains: ['B', 'A'] }],
    ]),
  )
  expect(found).toEqual([
    {
      pdbId: '1abc',
      method: 'X-ray',
      resolution: 1.5,
      start: 1,
      end: 90,
      coverage: 0.9,
      chains: ['A', 'B'],
    },
  ])
})

test('an empty or malformed answer is no entries', () => {
  expect(parseEntityAlignments({})).toEqual([])
  expect(parseEntityAlignments(null)).toEqual([])
  expect(
    parseEntityAlignments({ alignments: { target_alignments: [{}, 3] } }),
  ).toEqual([])
  expect(parseEntityDetails(undefined).size).toBe(0)
  expect(parseEntityDetails({ polymer_entities: [null, {}] }).size).toBe(0)
})

test('fetches the alignments, then the entities in one batch, asking an isoform as its entry', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation((url, init) => {
      const body: unknown = JSON.parse(
        typeof init?.body === 'string' ? init.body : '{}',
      )
      if (url === 'https://sequence-coordinates.rcsb.org/graphql') {
        expect(body).toEqual({ query: entityAlignmentsQuery('P04637') })
        return Promise.resolve(Response.json({ data: ALIGNMENTS }))
      }
      expect(url).toBe('https://data.rcsb.org/graphql')
      expect(body).toEqual({
        query: ENTITY_DETAILS_QUERY,
        variables: { ids: ['1TUP_3', '8R1F_3', '1H26_3', '2RH1_1'] },
      })
      return Promise.resolve(Response.json({ data: DETAILS }))
    })
  const found = await fetchExperimentalStructures('P04637-2', { fetch })
  expect(found.map(s => s.pdbId)).toEqual(['8r1f', '2rh1', '1tup', '1h26'])
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('an accession with no entries asks for no details', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ data: { alignments: { target_alignments: [] } } }),
    )
  expect(await fetchExperimentalStructures('A0A024R161', { fetch })).toEqual([])
  expect(fetch).toHaveBeenCalledTimes(1)
})
