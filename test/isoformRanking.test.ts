import { describe, expect, test } from 'vitest'

import {
  CCNA2_1H26_ENTITY1,
  CDK2_1H26_ENTITY0,
  HBA_TRANSCRIPT_P69905,
  HBB_BETA_4HHB_ENTITY1,
  HBB_TRANSCRIPT_P68871,
  P53_PEPTIDE_1H26_ENTITY2,
  P53_TRANSCRIPT_P04637,
  RAC1B_ISOFORM_B_P63000_2,
  RAC1_1MH1_ENTITY1,
  RAC1_ISOFORM_A_P63000_1,
} from './fixtures/structureFixtures.ts'
import {
  classifyIsoforms,
  pickStructureSequence,
  selectBestTranscript,
} from '../src/index.ts'

const isoforms = (...seqs: (string | undefined)[]) =>
  seqs.map((seq, i) => ({ id: `t${i}`, seq }))

describe('selectBestTranscript', () => {
  test('returns undefined when no isoform has a sequence', () => {
    expect(selectBestTranscript({ isoforms: isoforms(undefined) })).toBe(
      undefined,
    )
    expect(selectBestTranscript({ isoforms: [] })).toBe(undefined)
  })

  test('takes the longest translation with no structure to compare to', () => {
    expect(
      selectBestTranscript({
        isoforms: isoforms('MKTVRQERL', 'MKTVRQERLKSIVRILERSKEPVSGAQLAEEL'),
      }),
    ).toBe('t1')
  })

  test('an exact match beats a longer translation, trailing stop included', () => {
    expect(
      selectBestTranscript({
        isoforms: isoforms('MKTVRQERL*', 'MUCH_MUCH_LONGER_SEQUENCE'),
        structureSequence: 'MKTVRQERL',
      }),
    ).toBe('t0')
  })

  test('falls back to the longest when nothing matches', () => {
    expect(
      selectBestTranscript({
        isoforms: isoforms('SHORT', 'MUCH_LONGER_SEQUENCE'),
        structureSequence: 'NO_MATCH',
      }),
    ).toBe('t1')
  })

  test('only isoforms with a sequence are candidates', () => {
    expect(
      selectBestTranscript({
        isoforms: isoforms('SHORT_SEQ', undefined, undefined),
      }),
    ).toBe('t0')
  })

  // 4HHB's β chain is HBB minus Met1, so no isoform matches exactly; the
  // longest-first fallback then took a longer paralog-like isoform over the
  // one the structure was made from.
  test('with no exact match, the best-aligning isoform beats the longest', () => {
    expect(
      selectBestTranscript({
        isoforms: isoforms(
          HBB_TRANSCRIPT_P68871,
          HBA_TRANSCRIPT_P69905 + CDK2_1H26_ENTITY0.slice(0, 80),
        ),
        structureSequence: HBB_BETA_4HHB_ENTITY1,
      }),
    ).toBe('t0')
  })

  // Rac1b's extra exon aligns as a gap, so it matches every 1MH1 residue Rac1
  // does and ranking by identical residues then length chose it
  test('an isoform carrying an exon the structure lacks loses on score', () => {
    const { nonMatches } = classifyIsoforms({
      isoforms: isoforms(RAC1B_ISOFORM_B_P63000_2, RAC1_ISOFORM_A_P63000_1),
      structureSequence: RAC1_1MH1_ENTITY1,
    })
    expect(nonMatches[0]!.identical).toBe(nonMatches[1]!.identical)
    expect(nonMatches.map(r => r.id)).toEqual(['t1', 't0'])
  })

  test('classifyIsoforms reports the ids it could not translate', () => {
    expect(
      classifyIsoforms({ isoforms: isoforms('MKV', undefined) }).noData,
    ).toEqual(['t1'])
  })
})

describe('pickStructureSequence', () => {
  test('no structure sequences', () => {
    expect(pickStructureSequence(undefined, isoforms('MKV'))).toBe(undefined)
    expect(pickStructureSequence([], isoforms('MKV'))).toBe(undefined)
  })

  test('a single chain is used whether or not it matches', () => {
    expect(pickStructureSequence(['MKV'], isoforms('WWW'))).toBe('MKV')
  })

  test('prefers the chain an isoform translates to, not chain 0', () => {
    expect(
      pickStructureSequence(['GGGGGGGG', 'MKVLA'], isoforms('QQQ', 'MKVLA')),
    ).toBe('MKVLA')
    expect(pickStructureSequence(['GGG', 'MKVLA'], isoforms('MKVLA*'))).toBe(
      'MKVLA',
    )
  })

  test('falls back to the first chain when nothing aligns or has loaded', () => {
    expect(pickStructureSequence(['AAA', 'GGG'], isoforms('WWW'))).toBe('AAA')
    expect(pickStructureSequence(['AAA', 'BBB'], undefined)).toBe('AAA')
  })

  // With no exact match the first chain was CDK2, and p53β, which ends before
  // the bound peptide, won the isoform ranking on chance identities to the
  // kinase.
  test('1H26: isoforms are ranked against the p53 peptide, not CDK2', () => {
    const p53beta = `${P53_TRANSCRIPT_P04637.slice(0, 331)}DQTSFQKENC`
    const candidates = isoforms(p53beta, P53_TRANSCRIPT_P04637)
    const structureSequence = pickStructureSequence(
      [CDK2_1H26_ENTITY0, CCNA2_1H26_ENTITY1, P53_PEPTIDE_1H26_ENTITY2],
      candidates,
    )
    expect(structureSequence).toBe(P53_PEPTIDE_1H26_ENTITY2)
    expect(
      selectBestTranscript({ isoforms: candidates, structureSequence }),
    ).toBe('t1')
  })
})
