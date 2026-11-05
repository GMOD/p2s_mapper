import { expect, test } from 'vitest'

import {
  type Entity,
  chooseUniProtMappingForEntity,
  entityLabel,
  entityUniProtMappings,
  extractEntities,
  fillAuthSeqIds,
  makeLabelSeqIdIndex,
  oneLetterSequence,
  rangeToLabelSeqIds,
  residueNumber,
  labelSeqIdAt,
  residueRuns,
  toLabelSeqIds,
} from '../src/index.ts'

// A molstar model stub shaped like the fields extractEntities reads. Observed
// residues, when given, build the atomic hierarchy: one atom per residue, each
// residue on the chain of its entity.
function model(
  entities: {
    entityId: string
    /** molstar's `code` column, one entry per position */
    seq: string | string[]
    seqIds: number[]
    subtype?: string
    /** entity_poly.pdbx_seq_one_letter_code_can */
    canonical?: string
    /** the entity's ma_target_ref_db_details row */
    ref?: {
      dbName: string
      accession: string
      code: string
      gene: string
      begin: string
      end: string
    }
  }[],
  observed?: { entityId: string; labelSeqId: number; authSeqId: number }[],
) {
  const entityIds = entities.map(e => e.entityId)
  const withCanonical = entities.filter(e => e.canonical !== undefined)
  const withRef = entities.flatMap(e =>
    e.ref ? [{ entityId: e.entityId, ...e.ref }] : [],
  )
  const refFields: Record<string, (r: (typeof withRef)[number]) => string> = {
    target_entity_id: r => r.entityId,
    db_name: r => r.dbName,
    db_accession: r => r.accession,
    db_code: r => r.code,
    gene_name: r => r.gene,
    seq_db_align_begin: r => r.begin,
    seq_db_align_end: r => r.end,
  }
  return {
    obj: {
      data: {
        entities: {
          subtype: {
            rowCount: entities.length,
            value: (row: number) => entities[row]!.subtype ?? 'polypeptide(L)',
          },
          getEntityIndex: (id: string) => entityIds.indexOf(id),
        },
        sourceData: {
          data: {
            db: {
              entity_poly: {
                entity_id: {
                  rowCount: withCanonical.length,
                  value: (row: number) => withCanonical[row]!.entityId,
                },
                pdbx_seq_one_letter_code_can: {
                  rowCount: withCanonical.length,
                  value: (row: number) => withCanonical[row]!.canonical!,
                },
              },
            },
            frame: {
              categories: {
                ma_target_ref_db_details: {
                  rowCount: withRef.length,
                  getField: (name: string) => {
                    const read = refFields[name]
                    return read && { str: (row: number) => read(withRef[row]!) }
                  },
                },
              },
            },
          },
        },
        sequence: {
          sequences: entities.map(e => ({
            entityId: e.entityId,
            sequence: {
              code: { toArray: () => Array.from(e.seq) },
              seqId: { toArray: () => e.seqIds },
            },
          })),
        },
        ...(observed
          ? {
              atomicHierarchy: {
                chains: {
                  label_entity_id: {
                    rowCount: entityIds.length,
                    value: (row: number) => entityIds[row]!,
                  },
                  auth_asym_id: {
                    rowCount: entityIds.length,
                    value: (row: number) => 'ABCDEFG'[row]!,
                  },
                },
                residues: {
                  label_seq_id: {
                    rowCount: observed.length,
                    value: (row: number) => observed[row]!.labelSeqId,
                  },
                  auth_seq_id: {
                    rowCount: observed.length,
                    value: (row: number) => observed[row]!.authSeqId,
                  },
                },
                residueAtomSegments: {
                  offsets: observed.map((_, i) => i),
                  count: observed.length,
                },
                chainAtomSegments: {
                  index: observed.map(o => entityIds.indexOf(o.entityId)),
                },
              },
            }
          : {}),
      },
    },
  }
}

test('extractEntities carries author numbering, filling unobserved residues by offset', () => {
  // an RCSB-style entity numbered 1..6 whose construct starts at author 94,
  // with residue 3 unobserved and a renumbering after a disordered loop
  const [entity] = extractEntities(
    model(
      [{ entityId: '1', seq: 'SSSVPS', seqIds: [1, 2, 3, 4, 5, 6] }],
      [
        { entityId: '1', labelSeqId: 1, authSeqId: 94 },
        { entityId: '1', labelSeqId: 2, authSeqId: 95 },
        { entityId: '1', labelSeqId: 4, authSeqId: 97 },
        { entityId: '1', labelSeqId: 5, authSeqId: 120 },
        { entityId: '1', labelSeqId: 6, authSeqId: 121 },
      ],
    ),
  )!
  const e = entity!
  expect(e.chains).toEqual(['A'])
  expect(e.authSeqIds).toEqual([94, 95, 96, 97, 120, 121])
  expect(residueNumber(e, 0)).toBe(94)
  expect(residueNumber(e, 5)).toBe(121)
})

test('extractEntities flags DNA and RNA entities and labels them in nt', () => {
  const [dna, rna, protein] = extractEntities(
    model([
      {
        entityId: '1',
        seq: 'TTTCC',
        seqIds: [1, 2, 3, 4, 5],
        subtype: 'polydeoxyribonucleotide',
      },
      {
        entityId: '2',
        seq: 'GGAU',
        seqIds: [1, 2, 3, 4],
        subtype: 'polyribonucleotide',
      },
      { entityId: '3', seq: 'MKV', seqIds: [1, 2, 3] },
    ]),
  )!
  expect(dna!.nucleicAcid).toBe(true)
  expect(rna!.nucleicAcid).toBe(true)
  expect(protein!.nucleicAcid).toBeUndefined()
  expect(entityLabel(dna!)).toBe('Entity 1 (5 nt)')
  expect(entityLabel(protein!)).toBe('Entity 3 (3 aa)')
})

// 4ZZJ's p53 peptide carries acetyl-lysine (ALY) and norleucine (NLE). Read
// from molstar's `label` column it was "RHKALYLNLEF", 11 letters for 7
// residues, so every position after K3 addressed a residue further along.
test('a modified residue takes one position, spelled by its parent when the mmCIF names one', () => {
  const [peptide] = extractEntities(
    model([
      {
        entityId: '2',
        seq: ['R', 'H', 'K', 'X', 'L', 'X', 'F'],
        seqIds: [1, 2, 3, 4, 5, 6, 7],
        canonical: 'RHKKL\nLF',
      },
    ]),
  )!
  expect(peptide!.seq).toBe('RHKKLLF')
  expect(peptide!.seq).toHaveLength(peptide!.seqIds.length)
})

test('without a usable canonical sequence a modified residue stays X', () => {
  // PDB format carries no entity_poly, and GFP's chromophore is three parent
  // letters for one position
  expect(oneLetterSequence(['M', 'X', 'K'], undefined)).toBe('MXK')
  expect(oneLetterSequence(['S', 'X', 'V'], 'STYGV')).toBe('SXV')
})

test('fillAuthSeqIds: an unobserved N-terminus takes the first observed offset', () => {
  const observed = new Map([
    [3, 103],
    [4, 104],
  ])
  expect(fillAuthSeqIds([1, 2, 3, 4], observed)).toEqual([101, 102, 103, 104])
})

test('fillAuthSeqIds: nothing observed keeps the label numbering', () => {
  expect(fillAuthSeqIds([1, 2, 3], new Map())).toEqual([1, 2, 3])
  expect(fillAuthSeqIds([1, 2, 3], undefined)).toEqual([1, 2, 3])
})

test('residueRuns finds the positions an author range names', () => {
  const e: Entity = {
    entityId: '1',
    seq: 'SSSVPS',
    seqIds: [1, 2, 3, 4, 5, 6],
    authSeqIds: [94, 95, 96, 97, 120, 121],
    chains: ['A'],
  }
  expect(residueRuns(e, { start: 95, end: 95 })).toEqual([{ start: 1, end: 2 }])
  // a range spanning the renumbered loop covers the positions on both sides
  expect(residueRuns(e, { start: 96, end: 120 })).toEqual([
    { start: 2, end: 5 },
  ])
  // residues the fragment does not hold select nothing
  expect(residueRuns(e, { start: 1, end: 10 })).toEqual([])
  expect(residueRuns(undefined, { start: 1, end: 1 })).toEqual([])
})

test('residueNumber falls back to label ids, then to position + 1', () => {
  const e: Entity = { entityId: '1', seq: 'AB', seqIds: [94, 95], chains: [] }
  expect(residueNumber(e, 1)).toBe(95)
  expect(residueNumber(undefined, 1)).toBe(2)
})

const contiguous = (seq: string, from = 1): Entity => ({
  entityId: '1',
  seq,
  seqIds: Array.from(seq, (_, i) => i + from),
  chains: [],
})

test('extractEntities carries molstar label_seq_ids alongside the sequence', () => {
  const entities = extractEntities(
    model([{ entityId: '3', seq: 'MKAA', seqIds: [1, 2, 3, 4] }]),
  )
  expect(entities).toEqual([
    { entityId: '3', seq: 'MKAA', seqIds: [1, 2, 3, 4], chains: [] },
  ])
})

// The usual case: an mmCIF with entity_poly_seq (all of RCSB and AlphaFold)
// numbers residues 1..N, so position p is label_seq_id p+1.
test('contiguous-from-1 entity converts as position + 1', () => {
  const e = contiguous('MKAAY')
  expect(rangeToLabelSeqIds(e, { start: 0, end: 3 })).toEqual([1, 2, 3])
  expect(toLabelSeqIds(e, [0, 4])).toEqual([1, 5])
  expect(makeLabelSeqIdIndex(e).get(5)).toBe(4)
})

// A PDB-format file with no SEQRES records has no entity_poly_seq, so molstar
// falls back to the observed residues' author numbering. Verified against a
// real CA-only PDB: a chain starting at residue 94 reports seqIds 94.., and
// `position + 1` would address a residue 93 places away.
test('entity numbered from 94 does NOT convert as position + 1', () => {
  const e = contiguous('SSSVPSQKTY', 94)
  expect(rangeToLabelSeqIds(e, { start: 0, end: 3 })).toEqual([94, 95, 96])
  expect(toLabelSeqIds(e, [0])).toEqual([94])
  // the inbound direction agrees: molstar hovering label_seq_id 94 is residue 0
  expect(makeLabelSeqIdIndex(e).get(94)).toBe(0)
  expect(makeLabelSeqIdIndex(e).get(1)).toBeUndefined()
})

// An unobserved loop leaves a hole, so the offset is not even constant.
test('a gapped chain maps through the real ids, not a fixed offset', () => {
  const e: Entity = {
    entityId: '1',
    seq: 'ABCDE',
    seqIds: [94, 95, 96, 117, 118],
    chains: ['A'],
  }
  expect(rangeToLabelSeqIds(e, { start: 0, end: 5 })).toEqual([
    94, 95, 96, 117, 118,
  ])
  const index = makeLabelSeqIdIndex(e)
  expect(index.get(117)).toBe(3)
  // the residues inside the gap belong to no structure position
  expect(index.get(100)).toBeUndefined()
})

test('round-trips every position through both directions', () => {
  const e: Entity = {
    entityId: '1',
    seq: 'ABCDE',
    seqIds: [7, 8, 20, 21, 40],
    chains: ['A'],
  }
  const index = makeLabelSeqIdIndex(e)
  for (let pos = 0; pos < e.seq.length; pos++) {
    expect(index.get(toLabelSeqIds(e, [pos])[0]!)).toBe(pos)
  }
})

test('out-of-range positions are dropped rather than guessed', () => {
  const e = contiguous('MKAA')
  expect(toLabelSeqIds(e, [-1, 0, 99])).toEqual([1])
  expect(rangeToLabelSeqIds(e, { start: 2, end: 99 })).toEqual([3, 4])
  expect(rangeToLabelSeqIds(e, { start: 3, end: 3 })).toEqual([])
  expect(rangeToLabelSeqIds(undefined, { start: 0, end: 2 })).toEqual([])
  expect(toLabelSeqIds(undefined, [0])).toEqual([])
})

test('duplicate ids (micro-heterogeneity) collapse to the first position', () => {
  const e: Entity = {
    entityId: '1',
    seq: 'ABC',
    seqIds: [5, 5, 6],
    chains: ['A'],
  }
  expect(makeLabelSeqIdIndex(e).get(5)).toBe(0)
})

test('labelSeqIdAt reads one position, and nothing for a missing one', () => {
  const entity = { seqIds: [94, 95, 97] }
  expect(labelSeqIdAt(entity, 2)).toBe(97)
  expect(labelSeqIdAt(entity, 3)).toBeUndefined()
  expect(labelSeqIdAt(entity, undefined)).toBeUndefined()
})

test('extractEntities reads the UniProt entry a ModelCIF names for each entity', () => {
  // AlphaFold DB's GSTM1/GSTP1 complex AF-0000000210612662 numbers GSTP1 as
  // entity 1 on chain B and GSTM1 as entity 2 on chain A
  const ref = (accession: string, gene: string, end: string) => ({
    dbName: 'UNP',
    accession,
    code: `${gene}_HUMAN`,
    gene,
    begin: '1',
    end,
  })
  const entities = extractEntities(
    model([
      {
        entityId: '2',
        seq: 'MPMIL',
        seqIds: [1, 2, 3, 4, 5],
        ref: ref('P09488', 'GSTM1', '5'),
      },
      {
        entityId: '1',
        seq: 'MPPY',
        seqIds: [1, 2, 3, 4],
        ref: ref('P09211', 'GSTP1', '4'),
      },
      // a stated span that is not the entity's length cannot place a residue
      {
        entityId: '3',
        seq: 'MKV',
        seqIds: [1, 2, 3],
        ref: ref('P00001', 'X', '9'),
      },
      { entityId: '4', seq: 'MKV', seqIds: [1, 2, 3] },
    ]),
  )!
  expect(entities.map(e => e.uniProt)).toEqual([
    { accession: 'P09488', name: 'GSTM1_HUMAN', gene: 'GSTM1', start: 1 },
    { accession: 'P09211', name: 'GSTP1_HUMAN', gene: 'GSTP1', start: 1 },
    undefined,
    undefined,
  ])

  const mappings = entityUniProtMappings(entities)
  expect(mappings.map(m => m.accession)).toEqual(['P09488', 'P09211'])
  const gstp1 = chooseUniProtMappingForEntity(mappings, {
    entityId: '1',
    chains: ['B'],
  })
  expect(gstp1?.accession).toBe('P09211')
  expect(gstp1?.segments).toEqual([
    { entityId: '1', unpStart: 1, unpEnd: 4, structStart: 0, structEnd: 3 },
  ])
})

test('entityUniProtMappings places a fragment model by the UniProt residue it starts at', () => {
  const [mapping] = entityUniProtMappings([
    {
      entityId: '1',
      seq: 'MKVL',
      uniProt: { accession: 'P11532', start: 1401 },
    },
  ])
  expect(mapping?.segments).toEqual([
    {
      entityId: '1',
      unpStart: 1401,
      unpEnd: 1404,
      structStart: 0,
      structEnd: 3,
    },
  ])
})
