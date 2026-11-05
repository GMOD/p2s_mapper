import { expect, test } from 'vitest'

import {
  fetchAlphaFoldComplexModel,
  fetchAlphaFoldComplexes,
  getAlphaFoldComplexId,
  isAlphaFoldComplexId,
  parseAlphaFoldComplexModel,
  parseAlphaFoldComplexes,
  resolveStructureUrl,
  structureDisplayLabel,
} from '../src/index.ts'

// /api/complex/P09211, trimmed to its homodimer and one heterodimer
// (2026-11-05)
const GSTP1_COMPLEXES = [
  {
    modelEntityId: 'AF-0000000210612662',
    latestVersion: 1,
    globalMetricValue: 96.54,
    complexPredictionAccuracy_ipTM: 0.92,
    complexPredictionAccuracy_ipSAE: 0.87,
    complexPredictionAccuracy_pDockQ: 0.56,
    complexPredictionAccuracy_pDockQ2: 0.87,
    complexPredictionAccuracy_LIS: 0.69,
    uniprotAccession: ['P09488', 'P09211'],
    uniprotDescription: [
      'Glutathione S-transferase Mu 1',
      'Glutathione S-transferase P',
    ],
    gene: ['GSTM1', 'GSTP1'],
    assemblyType: 'Hetero',
    oligomericState: 'dimer',
    complexName:
      'Complex of Glutathione S-transferase Mu 1/Glutathione S-transferase P',
    complexComposition: [
      {
        identifierType: 'uniprotAccession',
        identifier: 'P09488',
        stoichiometry: 1,
      },
      {
        identifierType: 'uniprotAccession',
        identifier: 'P09211',
        stoichiometry: 1,
      },
    ],
    isComplex: true,
  },
  {
    modelEntityId: 'AF-0000000065928178',
    latestVersion: 1,
    globalMetricValue: 96.9,
    complexPredictionAccuracy_ipTM: 0.93,
    uniprotAccession: ['P09211'],
    uniprotDescription: ['Glutathione S-transferase P'],
    gene: ['GSTP1'],
    assemblyType: 'Homo',
    oligomericState: 'dimer',
    complexName: 'Homodimer of Glutathione S-transferase P',
    complexComposition: [
      {
        identifierType: 'uniprotAccession',
        identifier: 'P09211',
        stoichiometry: 2,
      },
    ],
    isComplex: true,
  },
]

// /api/prediction/AF-0000000210612662, one row per chain, trimmed
const GSTP1_GSTM1_MODEL = ['P09488', 'P09211'].map((accession, i) => ({
  modelEntityId: 'AF-0000000210612662',
  latestVersion: 1,
  sequence: ['MPMILGYW', 'MPPYTVVY'][i],
  gene: ['GSTM1', 'GSTP1'][i],
  uniprotAccession: accession,
  uniprotDescription: [
    'Glutathione S-transferase Mu 1',
    'Glutathione S-transferase P',
  ][i],
  chainId: ['A', 'B'][i],
  cifUrl: 'https://alphafold.ebi.ac.uk/files/AF-0000000210612662-model_v1.cif',
  plddtDocUrl:
    'https://alphafold.ebi.ac.uk/files/AF-0000000210612662-confidence_v1.json',
  paeDocUrl:
    'https://alphafold.ebi.ac.uk/files/AF-0000000210612662-predicted_aligned_error_v1.json',
  isComplex: true,
}))

function reply(status: number, body: unknown, log: string[] = []) {
  return (input: string | URL | Request) => {
    log.push(input instanceof Request ? input.url : input.toString())
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }
}

test('reads each complex with its members, names joined to accessions', () => {
  const [hetero, homo] = parseAlphaFoldComplexes(GSTP1_COMPLEXES)
  expect(hetero).toEqual({
    entity: 'AF-0000000210612662',
    homomer: false,
    oligomericState: 'dimer',
    name: 'Complex of Glutathione S-transferase Mu 1/Glutathione S-transferase P',
    members: [
      {
        accession: 'P09488',
        gene: 'GSTM1',
        description: 'Glutathione S-transferase Mu 1',
        copies: 1,
      },
      {
        accession: 'P09211',
        gene: 'GSTP1',
        description: 'Glutathione S-transferase P',
        copies: 1,
      },
    ],
    meanPlddt: 96.54,
    iptm: 0.92,
    ipsae: 0.87,
    pdockq: 0.56,
    pdockq2: 0.87,
    lis: 0.69,
  })
  expect(homo?.homomer).toBe(true)
  expect(homo?.members).toEqual([
    {
      accession: 'P09211',
      gene: 'GSTP1',
      description: 'Glutathione S-transferase P',
      copies: 2,
    },
  ])
  expect(homo?.pdockq).toBeUndefined()
})

test('skips a complex without a model id or a composition', () => {
  expect(
    parseAlphaFoldComplexes([
      { complexComposition: [{ identifier: 'P1', stoichiometry: 2 }] },
      { modelEntityId: 'AF-1', complexComposition: [] },
      'x',
    ]),
  ).toEqual([])
  expect(parseAlphaFoldComplexes({})).toEqual([])
})

test('an accession in no complex is an empty list, a server failure an error', async () => {
  const log: string[] = []
  expect(
    await fetchAlphaFoldComplexes('P04637', { fetch: reply(404, {}, log) }),
  ).toEqual([])
  expect(log).toEqual(['https://alphafold.ebi.ac.uk/api/complex/P04637'])
  await expect(
    fetchAlphaFoldComplexes('P04637', { fetch: reply(500, 'down') }),
  ).rejects.toThrow('HTTP 500 from alphafold.ebi.ac.uk')
  expect(
    await fetchAlphaFoldComplexes('P09211', {
      fetch: reply(200, GSTP1_COMPLEXES),
    }),
  ).toHaveLength(2)
})

test("reads a complex model's files and which protein each chain is", () => {
  expect(parseAlphaFoldComplexModel(GSTP1_GSTM1_MODEL)).toEqual({
    entity: 'AF-0000000210612662',
    url: 'https://alphafold.ebi.ac.uk/files/AF-0000000210612662-model_v1.cif',
    confidenceUrl:
      'https://alphafold.ebi.ac.uk/files/AF-0000000210612662-confidence_v1.json',
    paeUrl:
      'https://alphafold.ebi.ac.uk/files/AF-0000000210612662-predicted_aligned_error_v1.json',
    chains: [
      {
        chainId: 'A',
        accession: 'P09488',
        gene: 'GSTM1',
        description: 'Glutathione S-transferase Mu 1',
        sequence: 'MPMILGYW',
      },
      {
        chainId: 'B',
        accession: 'P09211',
        gene: 'GSTP1',
        description: 'Glutathione S-transferase P',
        sequence: 'MPPYTVVY',
      },
    ],
  })
  expect(parseAlphaFoldComplexModel([{ modelEntityId: 'AF-1' }])).toBe(
    undefined,
  )
})

test('asks the prediction API for a complex model by its id', async () => {
  const log: string[] = []
  const model = await fetchAlphaFoldComplexModel('AF-0000000210612662', {
    fetch: reply(200, GSTP1_GSTM1_MODEL, log),
  })
  expect(log).toEqual([
    'https://alphafold.ebi.ac.uk/api/prediction/AF-0000000210612662',
  ])
  expect(model?.url).toBe(
    'https://alphafold.ebi.ac.uk/files/AF-0000000210612662-model_v1.cif',
  )
  expect(
    await fetchAlphaFoldComplexModel('AF-1', { fetch: reply(404, {}) }),
  ).toBeUndefined()
})

test("recognizes a complex's id and file urls, not a monomer's", () => {
  expect(
    getAlphaFoldComplexId(
      'https://alphafold.ebi.ac.uk/files/AF-0000000066211449-model_v1.cif',
    ),
  ).toBe('AF-0000000066211449')
  expect(
    getAlphaFoldComplexId(
      'https://alphafold.ebi.ac.uk/files/AF-0000000066211449-model_v1.bcif?x=1',
    ),
  ).toBe('AF-0000000066211449')
  expect(getAlphaFoldComplexId('AF-0000000066211449')).toBe(
    'AF-0000000066211449',
  )
  expect(
    getAlphaFoldComplexId(
      'https://alphafold.ebi.ac.uk/files/AF-P04637-F1-model_v6.cif',
    ),
  ).toBeUndefined()
  expect(getAlphaFoldComplexId('https://e.com/1tup.cif')).toBeUndefined()
  expect(isAlphaFoldComplexId('AF-0000000066211449')).toBe(true)
  expect(isAlphaFoldComplexId('AF-P04637-F1')).toBe(false)
})

test('a complex id is a shorthand the loader resolves, and labels the structure', () => {
  expect(
    resolveStructureUrl({ alphaFoldComplexId: 'AF-1', pdbId: '1TUP' }),
  ).toBeUndefined()
  expect(structureDisplayLabel({ alphaFoldComplexId: 'AF-1' })).toBe(
    'AlphaFold complex AF-1',
  )
  expect(
    structureDisplayLabel({
      url: 'https://alphafold.ebi.ac.uk/files/AF-0000000066211449-model_v1.cif',
    }),
  ).toBe('AlphaFold complex AF-0000000066211449')
})
