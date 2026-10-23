// Draws docs/img/mapping.svg, the README's genome-to-residue example, by
// running the example through the package, so the figure cannot drift from
// the code.
//
//   pnpm docs:figure
//
// test/docs.test.ts fails when the SVG is stale.
import fs from 'node:fs'
import path from 'node:path'

import { genomeToTranscriptSeqMapping } from 'g2p_mapper'

import {
  alignmentCol,
  chooseMappedEntity,
  codonGenomeSpan,
  makeCoordinateMapper,
  makeLabelSeqIdIndex,
  residueNumber,
  structureAlignedSeq,
  structurePos,
  toLabelSeqIds,
  transcriptAlignedSeq,
  transcriptPos,
} from '../src/index.ts'

import type { Entity } from '../src/index.ts'

export const MAPPING_FIGURE = path.join(
  import.meta.dirname,
  '..',
  'docs/img/mapping.svg',
)

const COLUMNS = 29
const HOVERED_LABEL_SEQ_ID = 15

const EXONS = [
  { refName: 'chr17', start: 1000, end: 1060, type: 'CDS', phase: 0 },
  { refName: 'chr17', start: 2000, end: 2117, type: 'CDS' },
] as const

function runExample() {
  const transcript =
    'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDP*'
  const { g2p, p2gCodon } = genomeToTranscriptSeqMapping({
    refName: 'chr17',
    start: 1000,
    end: 2117,
    strand: 1,
    subfeatures: [...EXONS],
  })
  const entity: Entity = {
    entityId: '1',
    seq: 'GSHMSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQW',
    seqIds: Array.from({ length: 43 }, (_, i) => i + 1),
    authSeqIds: Array.from({ length: 43 }, (_, i) => i + 12),
    chains: ['A'],
  }
  const { alignment } = chooseMappedEntity(
    transcript,
    [entity],
    'smith_waterman',
  )!
  const mapper = makeCoordinateMapper(alignment)
  const column = (t: number) => mapper.transcriptToAlignment(transcriptPos(t))!

  const clickedGenome = EXONS[1].start
  const clicked = g2p[clickedGenome]!
  const clickedPos = mapper.transcriptToStructure(transcriptPos(clicked))!
  const hoveredPos = makeLabelSeqIdIndex(entity).get(HOVERED_LABEL_SEQ_ID)!
  const hovered = mapper.structureToTranscript(structurePos(hoveredPos))!
  const [hoveredStart, hoveredEnd] = codonGenomeSpan(p2gCodon, hovered)!

  return {
    transcriptRow: transcriptAlignedSeq(alignment),
    structureRow: structureAlignedSeq(alignment),
    mapper,
    entity,
    clickedPos,
    hoveredPos,
    exon2Column: column(g2p[EXONS[1].start]!),
    exon1Columns: [column(0), column(g2p[EXONS[0].end - 3]!)] as const,
    forward: {
      column: column(clicked),
      genome: codonGenomeSpan(p2gCodon, clicked)![0],
      label: `genome ${clickedGenome} → residue ${residueNumber(entity, clickedPos)}`,
    },
    reverse: {
      column: column(hovered),
      genome: hoveredStart,
      label: `label_seq_id ${HOVERED_LABEL_SEQ_ID} → genome ${hoveredStart}–${hoveredEnd}`,
    },
  }
}

const LEFT = 196
const CELL = 24
const SANS = 'Helvetica,Arial,sans-serif'
const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'
const INK = '#000000'
const MUTED = '#666666'

const DARK: Record<string, string> = {
  '#ffffff': '#0d1117',
  '#000000': '#e6edf3',
  '#666666': '#9198a1',
}

const darkStyle = () =>
  `<style>@media (prefers-color-scheme: dark) {${Object.entries(DARK)
    .map(([l, d]) => `[fill="${l}"]{fill:${d}}[stroke="${l}"]{stroke:${d}}`)
    .join('')}}</style>`

const Y = {
  genome: 44,
  transcript: 104,
  midline: 128,
  structure: 152,
  labelSeqId: 204,
  authSeqId: 240,
  notes: 286,
}
const HEIGHT = Y.notes + 58
const WIDTH = LEFT + COLUMNS * CELL + 110

const x = (col: number) => LEFT + col * CELL
const cx = (col: number) => x(col) + CELL / 2

interface TextOpts {
  size?: number
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  font?: string
  bold?: boolean
}

function text(
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

const ellipsis = (y: number) =>
  text(x(COLUMNS) + 6, y + 4, '…', { size: 12, fill: MUTED, anchor: 'start' })

function rowLabel(y: number, name: string, fn: string) {
  return [
    text(16, y - 2, name, { size: 12, anchor: 'start', bold: true }),
    text(16, y + 12, fn, {
      size: 10,
      fill: MUTED,
      anchor: 'start',
      font: MONO,
    }),
  ]
}

function bracket(from: number, to: number, label: string) {
  const y = Y.notes - 18
  const [xa, xb] = [x(from) + 3, x(to + 1) - 3]
  return [
    `<path d="M${xa} ${y - 6} V${y} H${xb} V${y - 6}" fill="none" stroke="${MUTED}"/>`,
    text((xa + xb) / 2, y + 14, label, { size: 10, fill: MUTED }),
  ]
}

function gapRuns(row: string) {
  const runs: [number, number][] = []
  for (let col = 0; col < COLUMNS; col++) {
    if (row[col] === '-') {
      const last = runs.at(-1)
      if (last?.[1] === col - 1) {
        last[1] = col
      } else {
        runs.push([col, col])
      }
    }
  }
  return runs
}

export function renderMappingFigure() {
  const ex = runExample()
  const { transcriptRow, structureRow, mapper, entity } = ex
  const out: string[] = []

  for (const [band, dash] of [
    [ex.forward, ''],
    [ex.reverse, ' stroke-dasharray="4 3"'],
  ] as const) {
    out.push(
      `<rect x="${x(band.column)}" y="${Y.genome - 12}" width="${CELL}" height="${Y.authSeqId + 14 - (Y.genome - 12)}" fill="none" stroke="${INK}"${dash}/>`,
    )
  }

  const [exon1Start, exon1End] = ex.exon1Columns
  const exon1 = [x(exon1Start) + 2, x(exon1End + 1) - 4]
  const exon2 = [x(ex.exon2Column) + 4, x(COLUMNS)]
  out.push(...rowLabel(Y.genome, 'genome', 'g2p_mapper'))
  for (const [xa, xb] of [exon1, exon2] as const) {
    out.push(
      `<rect x="${xa}" y="${Y.genome - 8}" width="${xb! - xa!}" height="16" fill="#ffffff" stroke="${INK}"/>`,
    )
  }
  for (let col = exon1Start + 1; col < COLUMNS; col++) {
    if (col !== ex.exon2Column) {
      out.push(
        `<line x1="${x(col)}" y1="${Y.genome - 8}" x2="${x(col)}" y2="${Y.genome + 8}" stroke="${MUTED}" stroke-width="0.6"/>`,
      )
    }
  }
  out.push(
    `<line x1="${exon1[1]}" y1="${Y.genome}" x2="${exon2[0]}" y2="${Y.genome}" stroke="${INK}" stroke-dasharray="2 2"/>`,
    ...EXONS.map((exon, i) =>
      text(
        [exon1, exon2][i]![0]!,
        Y.genome - 16,
        `exon ${i + 1} · ${i === 0 ? `${exon.refName}:` : ''}${exon.start}–${exon.end}`,
        { size: 10, fill: MUTED, anchor: 'start' },
      ),
    ),
    text((exon1[0]! + exon1[1]!) / 2, Y.genome + 22, 'one codon per residue', {
      size: 10,
      fill: MUTED,
    }),
    ellipsis(Y.genome),
  )
  for (const band of [ex.forward, ex.reverse]) {
    out.push(
      text(cx(band.column), Y.genome + 4, band.genome, {
        size: 8.5,
        font: MONO,
      }),
    )
  }

  out.push(
    ...rowLabel(Y.transcript, 'transcript', 'transcriptPos'),
    ...rowLabel(Y.structure, 'structure chain', 'structurePos'),
    text(16, Y.midline + 4, 'chooseMappedEntity', {
      size: 10,
      fill: MUTED,
      anchor: 'start',
      font: MONO,
    }),
  )
  let mismatch: number | undefined
  for (let col = 0; col < COLUMNS; col++) {
    const rows = [
      { y: Y.transcript, ch: transcriptRow[col]!, numberY: Y.transcript - 15 },
      { y: Y.structure, ch: structureRow[col]!, numberY: Y.structure + 22 },
    ]
    const pos = [
      mapper.alignmentToTranscript(alignmentCol(col)),
      mapper.alignmentToStructure(alignmentCol(col)),
    ]
    rows.forEach(({ y, ch, numberY }, i) => {
      if (ch === '-') {
        out.push(
          text(cx(col), y + 4, '–', { size: 12, fill: MUTED, font: MONO }),
        )
        return
      }
      const unmapped = i === 1 && pos[0] === undefined
      const dash = unmapped ? ' stroke-dasharray="2 2"' : ''
      out.push(
        `<rect x="${x(col) + 1}" y="${y - 10}" width="${CELL - 2}" height="20" fill="#ffffff" stroke="${INK}"${dash}/>`,
        text(cx(col), y + 5, ch, {
          size: 13,
          font: MONO,
        }),
        text(cx(col), numberY, pos[i]!, { size: 8.5, fill: MUTED, font: MONO }),
      )
    })
    const [t, s] = [transcriptRow[col], structureRow[col]]
    if (t !== '-' && s !== '-') {
      if (t !== s) {
        mismatch ??= col
      }
      out.push(
        text(cx(col), Y.midline + 4, t === s ? '|' : '·', {
          size: 12,
          fill: MUTED,
          font: MONO,
        }),
      )
    }
    const sPos = pos[1]
    if (sPos !== undefined) {
      out.push(
        text(cx(col), Y.labelSeqId + 4, toLabelSeqIds(entity, [sPos])[0]!, {
          size: 10,
          font: MONO,
        }),
        text(cx(col), Y.authSeqId + 4, residueNumber(entity, sPos), {
          size: 10,
          font: MONO,
        }),
      )
    }
  }
  out.push(
    ellipsis(Y.transcript),
    ellipsis(Y.structure),
    text(x(mismatch!) - 4, Y.midline + 4, 'mismatch, still mapped', {
      size: 10,
      fill: MUTED,
      anchor: 'end',
    }),
    ...rowLabel(Y.labelSeqId, 'label_seq_id', 'toLabelSeqIds'),
    ...rowLabel(Y.authSeqId, 'auth_seq_id', 'residueNumber'),
    text(x(COLUMNS) + 6, Y.labelSeqId + 4, 'Mol* selects', {
      size: 10,
      fill: MUTED,
      anchor: 'start',
    }),
    text(x(COLUMNS) + 6, Y.authSeqId + 4, 'shown to user', {
      size: 10,
      fill: MUTED,
      anchor: 'start',
    }),
    ...gapRuns(transcriptRow).flatMap(([a, b]) =>
      bracket(a, b, 'tag: maps to nothing'),
    ),
    ...gapRuns(structureRow).flatMap(([a, b]) =>
      bracket(a, b, 'not in the construct'),
    ),
  )

  for (const [band, dy, note] of [
    [ex.forward, 0, 'click the gene, highlight in 3D'],
    [ex.reverse, 30, 'hover in 3D, highlight the codon'],
  ] as const) {
    const at = x(band.column) - 6
    out.push(
      text(at, Y.notes - 4 + dy, band.label, {
        size: 10.5,
        anchor: 'end',
      }),
      text(at, Y.notes + 10 + dy, note, {
        size: 10,
        fill: MUTED,
        anchor: 'end',
      }),
    )
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="One residue mapped from the genome to the structure and back">`,
    darkStyle(),
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>`,
    ...out,
    '</svg>',
    '',
  ].join('\n')
}

if (import.meta.main) {
  fs.writeFileSync(MAPPING_FIGURE, renderMappingFigure())
}
