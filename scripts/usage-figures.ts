// Draws the README's per-example figures in docs/img/: the chain-choice figure
// runs its example through the package, and the other is a diagram of a call
// sequence.
//
//   pnpm docs:figure
//
// test/docs.test.ts fails when an SVG is stale.
import fs from 'node:fs'
import path from 'node:path'

import {
  alignmentQuality,
  chooseMappedEntity,
  describeAlignmentQuality,
  isLowSimilarity,
  makeCoordinateMapper,
  structureAlignedSeq,
  transcriptAlignedSeq,
  transcriptPos,
} from '../src/index.ts'

import {
  DNA_CHAIN,
  INK,
  MONO,
  MUTED,
  PROTEIN_CHAIN,
  TRANSCRIPT,
  text,
} from './figure-example.ts'

const img = (name: string) =>
  path.join(import.meta.dirname, '..', 'docs/img', name)

const svg = (width: number, height: number, label: string, body: string[]) =>
  [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${label}">`,
    `<rect width="${width}" height="${height}" fill="#ffffff"/>`,
    ...body,
    '</svg>',
    '',
  ].join('\n')

const box = (
  x: number,
  y: number,
  width: number,
  height: number,
  dashed = false,
) =>
  `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" stroke="${INK}"${dashed ? ' stroke-dasharray="2 2"' : ''}/>`

const required = <T>(value: T | undefined) => {
  if (value === undefined) {
    throw new Error('figure example no longer maps')
  }
  return value
}

const rowLabel = (y: number, title: string, note?: string) => [
  text(16, y + 4, title, { size: 12, anchor: 'start', bold: true }),
  ...(note
    ? [text(16, y + 18, note, { size: 10, fill: MUTED, anchor: 'start' })]
    : []),
]

function renderChooseChainFigure() {
  const picked = required(
    chooseMappedEntity(
      TRANSCRIPT,
      [{ seq: DNA_CHAIN, nucleicAcid: true }, { seq: PROTEIN_CHAIN }],
      'smith_waterman',
    ),
  )
  const top = transcriptAlignedSeq(picked.alignment)
  const bottom = structureAlignedSeq(picked.alignment)
  const mapper = makeCoordinateMapper(picked.alignment)
  const column = required(mapper.transcriptToAlignment(transcriptPos(16)))
  const structure = required(mapper.transcriptToStructure(transcriptPos(16)))
  const quality = alignmentQuality(picked.alignment)

  const COLUMNS = 26
  const LEFT = 150
  const CELL = 24
  const x = (col: number) => LEFT + col * CELL
  const cx = (col: number) => x(col) + CELL / 2
  const Y = { dna: 40, transcript: 100, mid: 124, chain: 148, notes: 214 }
  const out = [
    ...rowLabel(Y.dna, 'chain 0'),
    ...rowLabel(Y.transcript, 'transcript'),
    ...rowLabel(Y.chain, `chain ${picked.index}`, 'picked'),
    box(x(0) + 1, Y.dna - 10, 10 * CELL, 20, true),
    text(x(0) + 5 * CELL, Y.dna + 4, `${DNA_CHAIN.length} nt of DNA: skipped`, {
      size: 11,
      fill: MUTED,
    }),
    `<rect x="${x(column)}" y="${Y.transcript - 14}" width="${CELL}" height="${Y.chain + 14 - (Y.transcript - 14)}" fill="none" stroke="${INK}"/>`,
  ]
  for (let col = 0; col < COLUMNS; col++) {
    const t = top[col] ?? '-'
    const s = bottom[col] ?? '-'
    for (const [y, ch, dashed] of [
      [Y.transcript, t, false],
      [Y.chain, s, t === '-'],
    ] as const) {
      out.push(
        ch === '-'
          ? text(cx(col), y + 4, '–', { size: 12, fill: MUTED, font: MONO })
          : box(x(col) + 1, y - 10, CELL - 2, 20, dashed) +
              text(cx(col), y + 5, ch, { size: 13, font: MONO }),
      )
    }
    if (t !== '-' && s !== '-') {
      out.push(
        text(cx(col), Y.mid + 4, t === s ? '|' : '·', {
          size: 12,
          fill: MUTED,
          font: MONO,
        }),
      )
    }
  }
  out.push(
    text(x(COLUMNS) + 6, Y.transcript + 4, '…', {
      size: 12,
      fill: MUTED,
      anchor: 'start',
    }),
    text(x(COLUMNS) + 6, Y.chain + 4, '…', {
      size: 12,
      fill: MUTED,
      anchor: 'start',
    }),
    text(x(0) + 1.5 * CELL, Y.chain + 36, 'GSH tag: maps to nothing', {
      size: 10,
      fill: MUTED,
    }),
    text(cx(column), Y.chain + 36, `transcript 16 → structure ${structure}`, {
      size: 10,
    }),
  )
  const results = [
    `chooseMappedEntity → index ${picked.index}`,
    `describeAlignmentQuality → ${describeAlignmentQuality(quality)}`,
    `isLowSimilarity → ${isLowSimilarity(quality)}`,
  ]
  results.forEach((line, i) =>
    out.push(
      text(16, Y.notes + 18 * i, line, {
        size: 11,
        anchor: 'start',
        font: MONO,
      }),
    ),
  )
  return svg(
    x(COLUMNS) + 40,
    Y.notes + 18 * results.length + 6,
    'A transcript aligned to the protein chain of a structure, skipping a DNA chain',
    out,
  )
}

function renderFindStructureFigure() {
  const W = 230
  const H = 56
  const GAP = 40
  const colX = (i: number) => 16 + i * (W + GAP)
  const rowY = { predicted: 16, middle: 76, experimental: 136 }
  const node = (i: number, y: number, title: string, detail: string) => [
    box(colX(i), y, W, H),
    text(colX(i) + W / 2, y + 24, title, { size: 12, font: MONO, bold: true }),
    text(colX(i) + W / 2, y + 42, detail, { size: 10, fill: MUTED }),
  ]
  const link = (i: number, from: number, to: number) =>
    `<line x1="${colX(i) + W + 4}" y1="${from + H / 2}" x2="${colX(i + 1) - 4}" y2="${to + H / 2}" stroke="${INK}" marker-end="url(#head)"/>`
  return svg(
    colX(3) - GAP,
    rowY.experimental + H + 40,
    'A gene name becomes a UniProt accession, then either an AlphaFold model or a PDB entry',
    [
      `<defs><marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${INK}"/></marker></defs>`,
      ...node(
        0,
        rowY.middle,
        'searchUniProtEntries',
        'gene name → accession P04637',
      ),
      ...node(
        1,
        rowY.predicted,
        'fetchAlphaFoldModels',
        'every model of the accession',
      ),
      ...node(
        2,
        rowY.predicted,
        'pickAlphaFoldModel',
        'the one for your translation',
      ),
      ...node(
        1,
        rowY.experimental,
        'fetchExperimentalStructures',
        'PDB entries, best coverage first',
      ),
      ...node(
        2,
        rowY.experimental,
        'getPdbStructureUrl',
        'the best entry’s file URL',
      ),
      link(0, rowY.middle, rowY.predicted),
      link(0, rowY.middle, rowY.experimental),
      link(1, rowY.predicted, rowY.predicted),
      link(1, rowY.experimental, rowY.experimental),
      text(
        colX(1),
        rowY.experimental + H + 28,
        'use the AlphaFold model if there is one, else the best PDB entry',
        {
          size: 11,
          fill: MUTED,
          anchor: 'start',
        },
      ),
    ],
  )
}

export const renderUsageFigures = () => ({
  [img('choose-chain.svg')]: renderChooseChainFigure(),
  [img('find-structure.svg')]: renderFindStructureFigure(),
})

if (import.meta.main) {
  for (const [file, content] of Object.entries(renderUsageFigures())) {
    fs.writeFileSync(file, content)
  }
}
