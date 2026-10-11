import { describe, expect, it, test, vi } from 'vitest'

import {
  chooseUniProtMappingForEntity,
  fetchPdbEntry,
  fetchUniProtStructureMappings,
  parsePdbEntry,
  pdbEntryQuery,
} from '../src/index.ts'

// Abridged live answers to `pdbEntryQuery` from https://data.rcsb.org/graphql

// p53 DNA-binding domain on DNA: two DNA entities, then the protein, whose
// SEQRES 1 is UniProt 94 on each of three chains.
const ENTRY_1TUP = {
  entry: {
    polymer_entities: [
      {
        rcsb_id: '1TUP_3',
        entity_poly: {
          type: 'polypeptide(L)',
          pdbx_seq_one_letter_code_can: 'SSSVPSQKTYQ',
        },
        rcsb_polymer_entity_container_identifiers: {
          auth_asym_ids: ['A', 'B', 'C'],
        },
        rcsb_polymer_entity_align: [
          {
            reference_database_name: 'UniProt',
            reference_database_accession: 'P04637',
            aligned_regions: [
              { entity_beg_seq_id: 1, ref_beg_seq_id: 94, length: 219 },
            ],
          },
        ],
        uniprots: [
          { rcsb_id: 'P04637', rcsb_uniprot_entry_name: ['P53_HUMAN'] },
        ],
      },
      {
        rcsb_id: '1TUP_1',
        entity_poly: {
          type: 'polydeoxyribonucleotide',
          pdbx_seq_one_letter_code_can: 'TTTCCTAGACTTGCCCAATTA',
        },
        rcsb_polymer_entity_container_identifiers: { auth_asym_ids: ['E'] },
        rcsb_polymer_entity_align: null,
        uniprots: null,
      },
      {
        rcsb_id: '1TUP_2',
        entity_poly: {
          type: 'polydeoxyribonucleotide',
          pdbx_seq_one_letter_code_can: 'TAATTGGGCAAGTCTAGGAAA',
        },
        rcsb_polymer_entity_container_identifiers: { auth_asym_ids: ['F'] },
        rcsb_polymer_entity_align: null,
        uniprots: null,
      },
    ],
  },
}

// Haemoglobin: a heteromer where each entity maps to a different accession,
// and numbers from the mature protein (UniProt 2 is SEQRES 1).
const ENTRY_4HHB = {
  entry: {
    polymer_entities: [
      {
        rcsb_id: '4HHB_1',
        entity_poly: {
          type: 'polypeptide(L)',
          pdbx_seq_one_letter_code_can: 'VLSPADKTNVKAAW',
        },
        rcsb_polymer_entity_container_identifiers: {
          auth_asym_ids: ['A', 'C'],
        },
        rcsb_polymer_entity_align: [
          {
            reference_database_name: 'UniProt',
            reference_database_accession: 'P69905',
            aligned_regions: [
              { entity_beg_seq_id: 1, ref_beg_seq_id: 2, length: 141 },
            ],
          },
        ],
        uniprots: [
          { rcsb_id: 'P69905', rcsb_uniprot_entry_name: ['HBA_HUMAN'] },
        ],
      },
      {
        rcsb_id: '4HHB_2',
        entity_poly: {
          type: 'polypeptide(L)',
          pdbx_seq_one_letter_code_can: 'VHLTPEEKSAVTALW',
        },
        rcsb_polymer_entity_container_identifiers: {
          auth_asym_ids: ['B', 'D'],
        },
        rcsb_polymer_entity_align: [
          {
            reference_database_name: 'UniProt',
            reference_database_accession: 'P68871',
            aligned_regions: [
              { entity_beg_seq_id: 1, ref_beg_seq_id: 2, length: 146 },
            ],
          },
        ],
        uniprots: [
          { rcsb_id: 'P68871', rcsb_uniprot_entry_name: ['HBB_HUMAN'] },
        ],
      },
    ],
  },
}

// β2-adrenergic receptor with T4 lysozyme spliced into ICL3: one entity, two
// accessions, the receptor in two regions around the lysozyme.
const ENTRY_2RH1 = {
  entry: {
    polymer_entities: [
      {
        rcsb_id: '2RH1_1',
        entity_poly: {
          type: 'polypeptide(L)',
          pdbx_seq_one_letter_code_can: 'DYKDDDDA',
        },
        rcsb_polymer_entity_container_identifiers: { auth_asym_ids: ['A'] },
        rcsb_polymer_entity_align: [
          {
            reference_database_name: 'UniProt',
            reference_database_accession: 'P07550',
            aligned_regions: [
              { entity_beg_seq_id: 8, ref_beg_seq_id: 1, length: 230 },
              { entity_beg_seq_id: 399, ref_beg_seq_id: 264, length: 102 },
            ],
          },
          {
            reference_database_name: 'UniProt',
            reference_database_accession: 'P00720',
            aligned_regions: [
              { entity_beg_seq_id: 238, ref_beg_seq_id: 2, length: 161 },
            ],
          },
        ],
        uniprots: [
          { rcsb_id: 'P00720', rcsb_uniprot_entry_name: ['ENLYS_BPT4'] },
          { rcsb_id: 'P07550', rcsb_uniprot_entry_name: ['ADRB2_HUMAN'] },
        ],
      },
    ],
  },
}

test('the query names the entry in uppercase, as RCSB keys it', () => {
  expect(pdbEntryQuery('1tup')).toContain('entry(entry_id: "1TUP")')
})

test('parses the alignment into 0-based structure positions, one segment per chain', () => {
  const { mappings, proteinSequences } = parsePdbEntry(ENTRY_1TUP)!
  expect(proteinSequences).toEqual(['SSSVPSQKTYQ'])
  const [mapping, ...rest] = mappings
  expect(rest).toEqual([])
  expect(mapping?.accession).toBe('P04637')
  expect(mapping?.name).toBe('P53_HUMAN')
  expect(mapping?.segments).toEqual(
    ['A', 'B', 'C'].map(chainId => ({
      entityId: '3',
      chainId,
      unpStart: 94,
      unpEnd: 312,
      structStart: 0,
      structEnd: 218,
    })),
  )
})

test('a fusion lists both accessions, the receptor in two regions', () => {
  const { mappings } = parsePdbEntry(ENTRY_2RH1)!
  expect(mappings.map(m => [m.accession, m.name])).toEqual([
    ['P07550', 'ADRB2_HUMAN'],
    ['P00720', 'ENLYS_BPT4'],
  ])
  expect(mappings[0]?.segments.map(s => [s.structStart, s.structEnd])).toEqual([
    [7, 236],
    [398, 499],
  ])
  expect(mappings[1]?.segments).toEqual([
    {
      entityId: '1',
      chainId: 'A',
      unpStart: 2,
      unpEnd: 162,
      structStart: 237,
      structEnd: 397,
    },
  ])
})

test('a heteromer maps each entity to its own accession', () => {
  const { mappings, proteinSequences } = parsePdbEntry(ENTRY_4HHB)!
  expect(proteinSequences).toEqual(['VLSPADKTNVKAAW', 'VHLTPEEKSAVTALW'])
  const entity = (entityId: string, chains: string[]) => ({ entityId, chains })
  expect(
    chooseUniProtMappingForEntity(mappings, entity('1', ['A', 'C']))?.accession,
  ).toBe('P69905')
  expect(
    chooseUniProtMappingForEntity(mappings, entity('2', ['B', 'D']))?.accession,
  ).toBe('P68871')
  // Mol* numbers a PDB-format file's entities per chain: 4HHB.pdb's chain B
  // can be entity 3, which the mmCIF has none of. The chain id still names it.
  expect(
    chooseUniProtMappingForEntity(mappings, entity('3', ['B']))?.accession,
  ).toBe('P68871')
})

test('an entry nothing aligns to UniProt has no mappings; an unknown entry is undefined', () => {
  expect(
    parsePdbEntry({
      entry: {
        polymer_entities: [
          {
            rcsb_id: '1BNA_1',
            entity_poly: {
              type: 'polydeoxyribonucleotide',
              pdbx_seq_one_letter_code_can: 'CGCGAATTCGCG',
            },
            rcsb_polymer_entity_container_identifiers: {
              auth_asym_ids: ['A', 'B'],
            },
            rcsb_polymer_entity_align: null,
            uniprots: null,
          },
        ],
      },
    }),
  ).toEqual({ mappings: [], proteinSequences: [] })
  expect(parsePdbEntry({ entry: null })).toBeUndefined()
  expect(parsePdbEntry(undefined)).toBeUndefined()
})

test('a malformed region is skipped and the good one survives', () => {
  const entry = parsePdbEntry({
    entry: {
      polymer_entities: [
        {
          rcsb_id: '1ABC_1',
          rcsb_polymer_entity_align: [
            {
              reference_database_name: 'UniProt',
              reference_database_accession: 'P1',
              aligned_regions: [
                { entity_beg_seq_id: 1, ref_beg_seq_id: 1 },
                { entity_beg_seq_id: 1, ref_beg_seq_id: 5, length: 2 },
              ],
            },
            {
              reference_database_name: 'GenBank',
              reference_database_accession: 'X1',
              aligned_regions: [
                { entity_beg_seq_id: 1, ref_beg_seq_id: 1, length: 9 },
              ],
            },
          ],
        },
      ],
    },
  })
  expect(entry?.mappings).toEqual([
    {
      accession: 'P1',
      name: undefined,
      segments: [
        { entityId: '1', unpStart: 5, unpEnd: 6, structStart: 0, structEnd: 1 },
      ],
    },
  ])
})

// The retry policy. `fetchPdbEntry` retries twice at 1s and 3s because one
// dropped request would leave a fusion construct mapped onto its partner for
// the rest of a session — but an entry RCSB does not have cannot appear on a
// retry, and waiting 4s to repeat the answer costs a caller four seconds of
// "resolving" for a structure that will never resolve.
describe('fetchPdbEntry', () => {
  const graphql = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status })
  const sentBody = (init: RequestInit | undefined): unknown =>
    JSON.parse(typeof init?.body === 'string' ? init.body : '{}')

  it('posts the query to RCSB and reads the entry', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(graphql(200, { data: ENTRY_1TUP }))
    const mappings = await fetchUniProtStructureMappings('1tup', { fetch })
    expect(mappings.map(m => m.accession)).toEqual(['P04637'])
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://data.rcsb.org/graphql')
    expect(init?.method).toBe('POST')
    expect(sentBody(init)).toMatchObject({ query: pdbEntryQuery('1tup') })
  })

  it('does not retry an entry RCSB has none of, and says so as a 404', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(graphql(200, { data: { entry: null } }))
    await expect(fetchPdbEntry('9zzz', { fetch })).rejects.toThrow(
      /no entry 9ZZZ/,
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry a 4xx either', async () => {
    const fetch = vi.fn().mockResolvedValue(graphql(400, {}))
    await expect(fetchPdbEntry('nonsense', { fetch })).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('a GraphQL error in a 200 body is a failure that names the host', async () => {
    const fetch = vi.fn().mockResolvedValue(
      graphql(200, {
        errors: [{ message: 'Validation error' }],
      }),
    )
    await expect(fetchPdbEntry('1tup', { fetch })).rejects.toThrow(
      /data\.rcsb\.org: Validation error/,
    )
  })

  it('still retries a 500, which may not be the same answer twice', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(graphql(500, {}))
      .mockResolvedValueOnce(graphql(200, { data: ENTRY_1TUP }))
    const entry = await fetchPdbEntry('1tup', { fetch })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(entry.proteinSequences).toEqual(['SSSVPSQKTYQ'])
  })

  it('gives up after two retries', async () => {
    const fetch = vi.fn().mockResolvedValue(graphql(503, {}))
    await expect(fetchPdbEntry('1tup', { fetch })).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('does not retry once the caller has aborted', async () => {
    const controller = new AbortController()
    const fetch = vi.fn().mockImplementation(() => {
      controller.abort()
      return Promise.resolve(graphql(500, {}))
    })
    await expect(
      fetchPdbEntry('1tup', { fetch, signal: controller.signal }),
    ).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
