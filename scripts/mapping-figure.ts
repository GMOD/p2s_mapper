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
const INK = '#1f2328'
const MUTED = '#57606a'
const LINE = '#8c959f'
const ORANGE = { stroke: '#bc4c00', fill: '#ffe2c8' }
const BLUE = { stroke: '#0969da', fill: '#ddf4ff' }

const DARK: Record<string, string> = {
  '#ffffff': '#0d1117',
  '#1f2328': '#e6edf3',
  '#57606a': '#9198a1',
  '#8c959f': '#656c76',
  '#6e7781': '#8b949e',
  '#afb8c1': '#4d555f',
  '#c4ccd4': '#545d68',
  '#eef1f4': '#262c36',
  '#eaeef2': '#21262d',
  '#f6f8fa': '#151b23',
  '#bc4c00': '#f0883e',
  '#ffe2c8': '#3d2414',
  '#0969da': '#4493f8',
  '#ddf4ff': '#0f2a47',
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
const PANEL = LEFT + COLUMNS * CELL + 110
const WIDTH = PANEL + 180

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

  for (const [band, color] of [
    [ex.forward, ORANGE],
    [ex.reverse, BLUE],
  ] as const) {
    out.push(
      `<rect x="${x(band.column)}" y="${Y.genome - 12}" width="${CELL}" height="${Y.authSeqId + 14 - (Y.genome - 12)}" rx="4" fill="${color.fill}" stroke="${color.stroke}"/>`,
    )
  }

  const [exon1Start, exon1End] = ex.exon1Columns
  const exon1 = [x(exon1Start) + 2, x(exon1End + 1) - 4]
  const exon2 = [x(ex.exon2Column) + 4, x(COLUMNS)]
  out.push(...rowLabel(Y.genome, 'genome', 'g2p_mapper'))
  for (const [xa, xb] of [exon1, exon2] as const) {
    out.push(
      `<rect x="${xa}" y="${Y.genome - 8}" width="${xb! - xa!}" height="16" fill="#eaeef2" stroke="${LINE}"/>`,
    )
  }
  for (let col = exon1Start + 1; col < COLUMNS; col++) {
    if (col !== ex.exon2Column) {
      out.push(
        `<line x1="${x(col)}" y1="${Y.genome - 8}" x2="${x(col)}" y2="${Y.genome + 8}" stroke="${LINE}" stroke-width="0.6"/>`,
      )
    }
  }
  out.push(
    `<line x1="${exon1[1]}" y1="${Y.genome}" x2="${exon2[0]}" y2="${Y.genome}" stroke="${MUTED}" stroke-dasharray="2 2"/>`,
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
  for (const [band, color] of [
    [ex.forward, ORANGE],
    [ex.reverse, BLUE],
  ] as const) {
    out.push(
      text(cx(band.column), Y.genome + 4, band.genome, {
        size: 8.5,
        fill: color.stroke,
        font: MONO,
        bold: true,
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
          text(cx(col), y + 4, '–', { size: 12, fill: LINE, font: MONO }),
        )
        return
      }
      const unmapped = i === 1 && pos[0] === undefined
      const dash = unmapped ? ' stroke-dasharray="2 2"' : ''
      out.push(
        `<rect x="${x(col) + 1}" y="${y - 10}" width="${CELL - 2}" height="20" rx="3" fill="${unmapped ? '#f6f8fa' : '#ffffff'}" stroke="${LINE}"${dash}/>`,
        text(cx(col), y + 5, ch, {
          size: 13,
          fill: unmapped ? MUTED : INK,
          font: MONO,
          bold: true,
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

  for (const [band, color, dy, note] of [
    [ex.forward, ORANGE, 0, 'click the gene, highlight in 3D'],
    [ex.reverse, BLUE, 30, 'hover in 3D, highlight the codon'],
  ] as const) {
    const at = x(band.column) - 6
    out.push(
      text(at, Y.notes - 4 + dy, band.label, {
        size: 10.5,
        fill: color.stroke,
        anchor: 'end',
        bold: true,
      }),
      text(at, Y.notes + 10 + dy, note, {
        size: 10,
        fill: color.stroke,
        anchor: 'end',
      }),
    )
  }

  out.push(...structurePanel(ex))

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="One residue mapped from the genome to the structure and back">`,
    darkStyle(),
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>`,
    ...out,
    '</svg>',
    '',
  ].join('\n')
}

const HELIX = {
  radius: 30,
  rise: 14,
  width: 11,
  tilt: 0.35,
  turn: (100 * Math.PI) / 180,
  phase: (110 * Math.PI) / 180,
  last: 18,
  samples: 8,
}

function structurePanel(ex: ReturnType<typeof runExample>) {
  const { entity, mapper } = ex
  const first = [...Array(HELIX.last).keys()].find(
    pos => mapper.structureToTranscript(structurePos(pos)) !== undefined,
  )!
  const centerX = PANEL + 60
  const top = Y.transcript - 4
  const at = (residue: number) => {
    const angle = (residue - first) * HELIX.turn + HELIX.phase
    return {
      x: centerX + HELIX.radius * Math.cos(angle),
      y:
        top +
        (residue - first) * HELIX.rise +
        HELIX.tilt * HELIX.radius * Math.sin(angle),
      front: Math.sin(angle) > 0,
    }
  }
  const f = (n: number) => n.toFixed(1)

  const back: string[] = []
  const front: string[] = []
  for (let i = 0; i < (HELIX.last - first) * HELIX.samples; i++) {
    const a = at(first + i / HELIX.samples)
    const b = at(first + (i + 1) / HELIX.samples)
    const mid = at(first + (i + 0.5) / HELIX.samples)
    const w = HELIX.width
    const face = `M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)} L${f(b.x)} ${f(b.y + w)} L${f(a.x)} ${f(a.y + w)} Z`
    const edge = `M${f(a.x)} ${f(a.y)} L${f(b.x)} ${f(b.y)} M${f(a.x)} ${f(a.y + w)} L${f(b.x)} ${f(b.y + w)}`
    const [layer, fill, stroke] = mid.front
      ? [front, '#c4ccd4', '#6e7781']
      : [back, '#eef1f4', '#afb8c1']
    layer.push(
      `<path d="${face}" fill="${fill}" stroke="${fill}" stroke-width="0.6"/>`,
      `<path d="${edge}" fill="none" stroke="${stroke}" stroke-width="0.9"/>`,
    )
  }
  const start = at(first)
  const coil = `M${f(start.x)} ${f(start.y + HELIX.width / 2)} C${f(start.x + 14)} ${f(start.y - 10)} ${f(start.x - 10)} ${f(start.y - 22)} ${f(start.x + 6)} ${f(start.y - 40)}`

  const out = [
    text(PANEL, Y.genome - 16, '3D structure', {
      size: 12,
      anchor: 'start',
      bold: true,
    }),
    text(PANEL, Y.genome - 2, 'cartoon, as Mol* draws it', {
      size: 10,
      fill: MUTED,
      anchor: 'start',
    }),
    `<path d="${coil}" fill="none" stroke="#afb8c1" stroke-width="4" stroke-linecap="round"/>`,
    text(start.x + 14, start.y - 34, `${entity.seq.slice(0, first)} tag`, {
      size: 10,
      fill: MUTED,
      anchor: 'start',
    }),
    ...back,
    ...front,
  ]
  const end = at(HELIX.last)
  out.push(
    text(end.x, end.y + HELIX.width + 18, '⋮', { size: 12, fill: MUTED }),
  )

  const labelX = centerX + HELIX.radius + 24
  for (const [pos, color] of [
    [ex.clickedPos, ORANGE],
    [ex.hoveredPos, BLUE],
  ] as const) {
    const bead = at(pos)
    const y = bead.y + HELIX.width / 2
    out.push(
      `<line x1="${f(bead.x)}" y1="${f(y)}" x2="${labelX - 4}" y2="${f(y)}" stroke="${color.stroke}"/>`,
      `<circle cx="${f(bead.x)}" cy="${f(y)}" r="8.5" fill="${color.fill}" stroke="${color.stroke}" stroke-width="2"/>`,
      text(+f(bead.x), +f(y + 3), entity.seq[pos]!, {
        size: 9,
        font: MONO,
        bold: true,
      }),
      text(labelX, y + 4, `residue ${residueNumber(entity, pos)}`, {
        size: 10.5,
        fill: color.stroke,
        anchor: 'start',
        bold: true,
      }),
    )
  }
  return out
}

if (import.meta.main) {
  fs.writeFileSync(MAPPING_FIGURE, renderMappingFigure())
}
