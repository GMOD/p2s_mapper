import { expect, test } from 'vitest'

import {
  keepSharedStretches,
  runLocalAlignment,
  sharedIsoformResidues,
  structureSeqVsTranscriptSeqMap,
} from '../src/index.ts'

const tp53 =
  'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDPGPDEAPRMPEAAPPVAPAPAAPTPAAPAPAPSWPLSSSVPSQKT'

// TP53's residues 51-70 swapped for a paralogue sharing only an 8-residue
// stretch, as PKM's exons 9 and 10 do
const exon = tp53.slice(50, 70)
const swapped =
  tp53.slice(0, 50) + 'WYHKCW' + exon.slice(6, 14) + 'YWHCKW' + tp53.slice(70)

const carried = (from: string, to: string, residues: number[]) => {
  const shared = sharedIsoformResidues(from, to)
  return residues.map(r => shared.get(r))
}

test('sharedIsoformResidues: a skipped exon drops its residues and closes the gap', () => {
  const skipped = tp53.slice(0, 50) + tp53.slice(70)
  expect(carried(tp53, skipped, [44, 49, 55, 70, 74])).toEqual([
    44,
    49,
    undefined,
    50,
    54,
  ])
})

test('sharedIsoformResidues: a mutually exclusive exon carries nothing, though it shares a stretch', () => {
  const shared = sharedIsoformResidues(tp53, swapped)
  for (let r = 50; r < 70; r++) {
    expect(shared.get(r)).toBeUndefined()
  }
  expect(shared.get(49)).toBe(49)
  expect(shared.get(70)).toBe(70)
})

test('sharedIsoformResidues: a short exon shared at the end carries, bounded by a gap', () => {
  // VEGFA's exon 8a: six residues after a skipped exon, then the end
  const canonical = tp53.slice(0, 60) + 'CDKPRR'
  const skipped = tp53.slice(0, 40) + 'CDKPRR'
  expect(carried(canonical, skipped, [60, 65])).toEqual([40, 45])
})

test('sharedIsoformResidues: a lone substitution between shared stretches carries', () => {
  const conflict = `${tp53.slice(0, 50)}W${tp53.slice(51)}`
  expect(carried(tp53, conflict, [50])).toEqual([50])
})

test('keepSharedStretches: a local alignment of two isoforms unmaps the swapped exon and keeps both rows whole', () => {
  // row 0 is the transcript, row 1 the other isoform, as the 1D linkage aligns
  const pa = runLocalAlignment(swapped, tp53, 'smith_waterman')
  const before = structureSeqVsTranscriptSeqMap(pa)
  expect(before.structureSeqToTranscriptSeqPosition[55]).toBeDefined()

  const kept = keepSharedStretches(pa)
  const { structureSeqToTranscriptSeqPosition: map } =
    structureSeqVsTranscriptSeqMap(kept)
  for (let r = 50; r < 70; r++) {
    expect(map[r]).toBeUndefined()
  }
  expect(map[49]).toBe(49)
  expect(map[70]).toBe(70)
  expect(kept.alns[0].seq.replaceAll('-', '')).toBe(swapped)
  expect(kept.alns[1].seq.replaceAll('-', '')).toBe(tp53)
})

test('keepSharedStretches: identical isoforms come back unchanged', () => {
  const pa = runLocalAlignment(tp53, tp53, 'smith_waterman')
  expect(keepSharedStretches(pa)).toBe(pa)
})
