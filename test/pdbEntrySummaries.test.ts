import { expect, test, vi } from 'vitest'

import {
  PDB_ENTRY_SUMMARIES_QUERY,
  fetchPdbEntrySummaries,
  parsePdbEntrySummaries,
  pdbEntryPartners,
} from '../src/index.ts'

// Abridged from https://data.rcsb.org/graphql, 2026-11-05: NRAS with SHOC2
// (9BTM), p53's core on two DNA strands (1TUP), and an NRAS peptide held by an
// MHC (7OW4), whose peptide RCSB maps to NRAS
const ENTRIES = {
  entries: [
    {
      rcsb_id: '9BTM',
      struct: { title: 'NRas 1-169 Q61R in Complex with Shoc2 80-582' },
      polymer_entities: [
        {
          rcsb_id: '9BTM_2',
          rcsb_polymer_entity: { pdbx_description: 'GTPase NRas' },
          entity_poly: { rcsb_entity_polymer_type: 'Protein' },
          rcsb_polymer_entity_container_identifiers: {
            uniprot_ids: ['P01111'],
            auth_asym_ids: ['A'],
          },
        },
        {
          rcsb_id: '9BTM_1',
          rcsb_polymer_entity: {
            pdbx_description: 'Leucine-rich repeat protein SHOC-2',
          },
          entity_poly: { rcsb_entity_polymer_type: 'Protein' },
          rcsb_polymer_entity_container_identifiers: {
            uniprot_ids: ['Q9UQ13'],
            auth_asym_ids: ['B'],
          },
        },
      ],
      nonpolymer_entities: [
        {
          nonpolymer_comp: {
            chem_comp: { id: 'GTP', name: "GUANOSINE-5'-TRIPHOSPHATE" },
          },
        },
        { nonpolymer_comp: { chem_comp: { id: 'MG', name: 'MAGNESIUM ION' } } },
        { nonpolymer_comp: { chem_comp: { id: 'MG', name: 'MAGNESIUM ION' } } },
      ],
    },
    {
      rcsb_id: '1TUP',
      struct: { title: 'TUMOR SUPPRESSOR P53 COMPLEXED WITH DNA' },
      polymer_entities: [
        {
          rcsb_id: '1TUP_1',
          rcsb_polymer_entity: { pdbx_description: "DNA (5'-D(*TP*TP*TP)-3')" },
          entity_poly: { rcsb_entity_polymer_type: 'DNA' },
          rcsb_polymer_entity_container_identifiers: {
            uniprot_ids: null,
            auth_asym_ids: ['E'],
          },
        },
        {
          rcsb_id: '1TUP_3',
          rcsb_polymer_entity: {
            pdbx_description: 'PROTEIN (P53 TUMOR SUPPRESSOR )',
          },
          entity_poly: { rcsb_entity_polymer_type: 'Protein' },
          rcsb_polymer_entity_container_identifiers: {
            uniprot_ids: ['P04637'],
            auth_asym_ids: ['A', 'B', 'C'],
          },
        },
      ],
      nonpolymer_entities: [
        { nonpolymer_comp: { chem_comp: { id: 'ZN', name: 'ZINC ION' } } },
      ],
    },
    {
      rcsb_id: '7OW4',
      struct: null,
      polymer_entities: [
        {
          rcsb_id: '7OW4_3',
          rcsb_polymer_entity: {
            pdbx_description: 'KRAS G12D peptide (VVVGADGVGK)',
          },
          entity_poly: { rcsb_entity_polymer_type: 'Protein' },
          rcsb_polymer_entity_container_identifiers: {
            uniprot_ids: ['P01111'],
            auth_asym_ids: ['C', 'F'],
          },
        },
        {
          rcsb_id: '7OW4_4',
          rcsb_polymer_entity: { pdbx_description: 'T cell receptor' },
          entity_poly: { rcsb_entity_polymer_type: 'Protein' },
          rcsb_polymer_entity_container_identifiers: null,
        },
        { rcsb_polymer_entity: { pdbx_description: 'no id' } },
      ],
      nonpolymer_entities: null,
    },
  ],
}

test('each entry keyed in lower case, with its title, polymers and ligands', () => {
  const summaries = parsePdbEntrySummaries(ENTRIES)
  expect([...summaries.keys()]).toEqual(['9btm', '1tup', '7ow4'])
  expect(summaries.get('9btm')).toEqual({
    pdbId: '9btm',
    title: 'NRas 1-169 Q61R in Complex with Shoc2 80-582',
    polymers: [
      {
        entityId: '9BTM_2',
        description: 'GTPase NRas',
        type: 'Protein',
        uniprotIds: ['P01111'],
        chains: ['A'],
      },
      {
        entityId: '9BTM_1',
        description: 'Leucine-rich repeat protein SHOC-2',
        type: 'Protein',
        uniprotIds: ['Q9UQ13'],
        chains: ['B'],
      },
    ],
    ligands: [
      { id: 'GTP', name: "GUANOSINE-5'-TRIPHOSPHATE" },
      { id: 'MG', name: 'MAGNESIUM ION' },
    ],
  })
})

test('a missing title, mapping or ligand list reads as none', () => {
  const entry = parsePdbEntrySummaries(ENTRIES).get('7ow4')
  expect(entry?.title).toBeUndefined()
  expect(entry?.ligands).toEqual([])
  expect(entry?.polymers.map(p => p.entityId)).toEqual(['7OW4_3', '7OW4_4'])
  expect(entry?.polymers[1]).toMatchObject({ uniprotIds: [], chains: [] })
})

test('partners are the polymers SIFTS does not map to the protein, nucleic acids included', () => {
  const summaries = parsePdbEntrySummaries(ENTRIES)
  const partners = (pdbId: string, uniprotId: string) =>
    pdbEntryPartners(summaries.get(pdbId)!, uniprotId).map(p => p.entityId)
  expect(partners('9btm', 'P01111')).toEqual(['9BTM_1'])
  expect(partners('1tup', 'P04637-2')).toEqual(['1TUP_1'])
  expect(partners('7ow4', 'P01111')).toEqual(['7OW4_4'])
})

test('an empty or malformed answer is no entries', () => {
  expect(parsePdbEntrySummaries(undefined).size).toBe(0)
  expect(parsePdbEntrySummaries({ entries: null }).size).toBe(0)
  expect(parsePdbEntrySummaries({ entries: [null, {}, 3] }).size).toBe(0)
})

test('asks for every entry once, in upper case, in one request', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation((url, init) => {
      expect(url).toBe('https://data.rcsb.org/graphql')
      expect(
        JSON.parse(typeof init?.body === 'string' ? init.body : ''),
      ).toEqual({
        query: PDB_ENTRY_SUMMARIES_QUERY,
        variables: { ids: ['9BTM', '1TUP', '7OW4'] },
      })
      return Promise.resolve(Response.json({ data: ENTRIES }))
    })
  const summaries = await fetchPdbEntrySummaries(
    ['9btm', '1TUP', '9BTM', '7ow4'],
    { fetch },
  )
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(summaries.get('1tup')?.title).toBe(
    'TUMOR SUPPRESSOR P53 COMPLEXED WITH DNA',
  )
})

test('no ids, no request', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>()
  expect((await fetchPdbEntrySummaries([], { fetch })).size).toBe(0)
  expect(fetch).not.toHaveBeenCalled()
})

test('a long list goes in batches sent together', async () => {
  const ids = Array.from({ length: 700 }, (_, i) => `${1000 + i}`)
  const batchSizes: number[] = []
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation((_url, init) => {
      const asked = [
        ...(typeof init?.body === 'string' ? init.body : '').matchAll(
          /"(\d{4})"/g,
        ),
      ].map(m => m[1])
      batchSizes.push(asked.length)
      return Promise.resolve(
        Response.json({
          data: { entries: asked.map(id => ({ rcsb_id: id })) },
        }),
      )
    })
  const summaries = await fetchPdbEntrySummaries(ids, { fetch })
  expect(batchSizes).toEqual([300, 300, 100])
  expect(summaries.size).toBe(700)
})

test('an RCSB error is thrown, naming the host', async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(
      Response.json({ errors: [{ message: 'Validation error' }] }),
    )
  await expect(fetchPdbEntrySummaries(['9BTM'], { fetch })).rejects.toThrow(
    'data.rcsb.org: Validation error',
  )
})
