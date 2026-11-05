// Draws docs/img/overview-light.svg and overview-dark.svg, the README's hero
// figure: a structure holds only part of the protein, and p2s_mapper connects
// the two. Every number comes from the same example as mapping.svg, run
// through the package.
//
//   pnpm docs:figure
//
// test/docs.test.ts fails when either SVG is stale.
import fs from 'node:fs'
import path from 'node:path'

import { residueNumber, structurePos, toLabelSeqIds } from '../src/index.ts'

import { EXONS, runExample } from './mapping-figure.ts'

const IMAGES = path.join(import.meta.dirname, '..', 'docs/img')

export const OVERVIEW_FIGURES = {
  light: path.join(IMAGES, 'overview-light.svg'),
  dark: path.join(IMAGES, 'overview-dark.svg'),
}

interface Palette {
  background: string
  ink: string
  muted: string
  shape: string
  accent: string
  covered: string
  coveredText: string
  outline: string
  stub: string
}

const PALETTES: Record<keyof typeof OVERVIEW_FIGURES, Palette> = {
  light: {
    background: '#ffffff',
    ink: '#1f2328',
    muted: '#4b5563',
    shape: '#57606a',
    accent: '#f25c05',
    covered: '#0b5fff',
    coveredText: '#0a4fd6',
    outline: '#6e7781',
    stub: '#8c959f',
  },
  dark: {
    background: '#0d1117',
    ink: '#f0f6fc',
    muted: '#a2acb8',
    shape: '#8b949e',
    accent: '#ff8a3d',
    covered: '#4c9aff',
    coveredText: '#79b8ff',
    outline: '#8b949e',
    stub: '#6e7681',
  },
}

const WIDTH = 1000
const HEIGHT = 252
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

const PROTEIN = { x: 352, width: 352 }
const COVERED = { x: 430, width: 130 }

function coveredTranscriptSpan() {
  const { mapper, entity } = runExample()
  const positions = Array.from({ length: entity.seq.length }, (_, i) =>
    mapper.structureToTranscript(structurePos(i)),
  ).filter(t => t !== undefined)
  return [positions[0]!, positions.at(-1)!] as const
}

function numbers() {
  const ex = runExample()
  const [first, last] = coveredTranscriptSpan()
  return {
    genome: `${EXONS[0].refName}:${ex.forward.genome}`,
    protein: `protein position ${ex.clickedTranscript}`,
    labelSeqId: `label_seq_id ${toLabelSeqIds(ex.entity, [ex.clickedPos])[0]}`,
    shown: `shown as ${residueNumber(ex.entity, ex.clickedPos)}`,
    clickedX:
      COVERED.x +
      (COVERED.width * (ex.clickedTranscript - first + 0.5)) /
        (last - first + 1),
  }
}

function text(
  tx: number | string,
  ty: number,
  fill: string,
  size: number,
  content: string,
  { anchor = 'middle', bold = false } = {},
) {
  const weight = bold ? ' font-weight="600"' : ''
  return `<text x="${tx}" y="${ty}" fill="${fill}" font-size="${size}" text-anchor="${anchor}"${weight}>${content}</text>`
}

function arrow(p: Palette, from: number, to: number, label: string) {
  return [
    `<line x1="${from}" y1="106" x2="${to}" y2="106" stroke="${p.ink}" stroke-width="2" marker-start="url(#head)" marker-end="url(#head)"/>`,
    text((from + to) / 2, 88, p.ink, 16, label, { bold: true }),
  ]
}

function gene(p: Palette, label: string) {
  const exons = [
    [40, 22],
    [88, 70],
    [184, 44],
    [254, 36],
  ]
  return [
    text(40, 30, p.muted, 15, 'gene', { anchor: 'start' }),
    '<g transform="translate(40,26) scale(0.74) translate(-40,0)">',
    `<line x1="40" y1="80" x2="290" y2="80" stroke="${p.shape}" stroke-width="2"/>`,
    ...exons.map(
      ([x, width]) =>
        `<rect x="${x}" y="71" width="${width}" height="18" rx="5" fill="${p.shape}"/>`,
    ),
    `<rect x="88" y="65" width="11" height="30" rx="2" fill="${p.accent}"/>`,
    '</g>',
    text(88, 152, p.ink, 16, label),
  ]
}

function protein(p: Palette, label: string, clickedX: number) {
  return [
    text(PROTEIN.x, 30, p.muted, 15, 'full-length protein', {
      anchor: 'start',
    }),
    `<rect x="${PROTEIN.x + 1}" y="97" width="${PROTEIN.width - 2}" height="18" rx="6" fill="none" stroke="${p.outline}" stroke-width="2.5" stroke-dasharray="7 5"/>`,
    `<rect x="${COVERED.x}" y="92" width="${COVERED.width}" height="28" rx="3" fill="${p.covered}"/>`,
    `<rect x="${clickedX.toFixed(1)}" y="88" width="10" height="36" rx="2" fill="${p.accent}"/>`,
    text((clickedX + 5).toFixed(1), 82, p.ink, 16, label),
    `<path d="M${COVERED.x} 132 V136 H${COVERED.x + COVERED.width} V130" fill="none" stroke="${p.covered}" stroke-width="2.5"/>`,
    text(
      COVERED.x + COVERED.width / 2,
      156,
      p.coveredText,
      15,
      'only this part has a structure',
      { bold: true },
    ),
    text(PROTEIN.x + PROTEIN.width - 8, 134, p.muted, 14, 'no structure', {
      anchor: 'end',
    }),
  ]
}

function structure(p: Palette, labelSeqId: string, shown: string) {
  return [
    text(800, 30, p.muted, 15, '3D structure', { anchor: 'start' }),
    '<g transform="translate(632,-10) scale(0.56)">',
    `<path d="M240,338 C282,322 306,290 330,262" fill="none" stroke="${p.stub}" stroke-width="13" stroke-linecap="round"/>`,
    `<path d="M330,262 C300,230 352,196 382,214 S420,268 450,244 S430,186 466,176 S530,196 512,232 S470,286 520,292 S580,260 560,226" fill="none" stroke="${p.covered}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<circle cx="371" cy="209" r="11" fill="${p.accent}"/>`,
    '</g>',
    text(760, 184, p.ink, 14, 'lab-added construct', { anchor: 'end' }),
    text(900, 216, p.ink, 16, labelSeqId),
    text(900, 236, p.muted, 14, shown),
  ]
}

export function renderOverviewFigure(theme: keyof typeof OVERVIEW_FIGURES) {
  const p = PALETTES[theme]
  const n = numbers()
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="A gene maps to a full-length protein, only part of which has a 3D structure; p2s_mapper maps that part to the structure" font-family="${SANS}">`,
    `<defs><marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" fill="${p.ink}"/></marker></defs>`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${p.background}"/>`,
    ...gene(p, n.genome),
    ...arrow(p, 256, 332, 'g2p_mapper'),
    ...protein(p, n.protein, n.clickedX),
    ...arrow(p, 718, 784, 'p2s_mapper'),
    ...structure(p, n.labelSeqId, n.shown),
    '</svg>',
    '',
  ].join('\n')
}

if (import.meta.main) {
  for (const theme of ['light', 'dark'] as const) {
    fs.writeFileSync(OVERVIEW_FIGURES[theme], renderOverviewFigure(theme))
  }
}
