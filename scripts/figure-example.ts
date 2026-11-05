// The README's genome example, run through the package, and the drawing helpers
// the figures share, so the figures cannot drift from the code.
import { genomeToTranscriptSeqMapping } from 'g2p_mapper'

import { chooseMappedEntity, makeCoordinateMapper } from '../src/index.ts'

import type { Entity } from '../src/index.ts'

export const EXONS = [
  { refName: 'chr17', start: 1000, end: 1060, type: 'CDS', phase: 0 },
  { refName: 'chr17', start: 2000, end: 2117, type: 'CDS' },
] as const

export const TRANSCRIPT =
  'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDP*'
export const DNA_CHAIN = 'TTTCCTAGACTTGCCCAATTA'
export const PROTEIN_CHAIN = 'GSHMSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQW'

export function runExample() {
  const { g2p } = genomeToTranscriptSeqMapping({
    refName: 'chr17',
    start: 1000,
    end: 2117,
    strand: 1,
    subfeatures: [...EXONS],
  })
  const entity: Entity = {
    entityId: '1',
    seq: PROTEIN_CHAIN,
    seqIds: Array.from({ length: 43 }, (_, i) => i + 1),
    authSeqIds: Array.from({ length: 43 }, (_, i) => i + 12),
    chains: ['A'],
  }
  const { alignment } = chooseMappedEntity(
    TRANSCRIPT,
    [entity],
    'smith_waterman',
  )!
  const mapper = makeCoordinateMapper(alignment)

  return {
    exonResidues: EXONS.map(exon => {
      const first = g2p[exon.start]!
      return [first, first + (exon.end - exon.start) / 3 - 1] as const
    }),
    mapper,
    entity,
  }
}

const SANS = 'Helvetica,Arial,sans-serif'
export const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
export const INK = '#000000'
export const MUTED = '#666666'

interface TextOpts {
  size?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  font?: string
  bold?: boolean
}

export function text(
  tx: number,
  ty: number,
  s: string | number,
  {
    size = 11,
    fill = INK,
    anchor = 'middle',
    font = SANS,
    bold = false,
  }: TextOpts = {},
) {
  const weight = bold ? ' font-weight="bold"' : ''
  return `<text x="${tx}" y="${ty}" font-family="${font}" font-size="${size}" fill="${fill}" text-anchor="${anchor}"${weight}>${s}</text>`
}
