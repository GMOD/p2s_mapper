// Draws docs/img/choose-chain.svg, the README's first example, by running it
// through the package.
//
//   pnpm docs:figure
//
// test/docs.test.ts fails when an SVG is stale.
import fs from 'node:fs'
import path from 'node:path'

import {
  chooseMappedEntity,
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

  const COLUMNS = 22
  const LEFT = 130
  const CELL = 24
  const x = (col: number) => LEFT + col * CELL
  const cx = (col: number) => x(col) + CELL / 2
  const Y = { transcript: 36, chain: 84 }
  const out = [
    ...rowLabel(Y.transcript, 'transcript'),
    ...rowLabel(Y.chain, 'structure chain'),
    `<rect x="${x(column)}" y="${Y.transcript - 14}" width="${CELL}" height="${Y.chain - Y.transcript + 28}" fill="none" stroke="${INK}"/>`,
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
    text(x(0) + 1.5 * CELL, Y.chain + 32, 'lab-added tag: maps to nothing', {
      size: 10,
      fill: MUTED,
      anchor: 'start',
    }),
    text(cx(column), Y.chain + 32, `16 → ${structure}`, { size: 11 }),
  )
  return svg(
    x(COLUMNS) + 40,
    Y.chain + 48,
    'A transcript aligned to the protein chain of a structure; the lab-added tag maps to nothing',
    out,
  )
}

export const renderUsageFigures = () => ({
  [img('choose-chain.svg')]: renderChooseChainFigure(),
})

if (import.meta.main) {
  for (const [file, content] of Object.entries(renderUsageFigures())) {
    fs.writeFileSync(file, content)
  }
}
