// Draws docs/img/overview.svg, the README's hero figure: a structure holds only
// part of the protein, and p2s_mapper connects the two. Which stretch of each
// coding exon the structure covers comes from the same example as mapping.svg,
// run through the package.
//
//   pnpm docs:figure
//
// test/docs.test.ts fails when the SVG is stale.
import fs from 'node:fs'
import path from 'node:path'

import { structurePos } from '../src/index.ts'

import { EXONS, runExample } from './mapping-figure.ts'

export const OVERVIEW_FIGURE = path.join(
  import.meta.dirname,
  '..',
  'docs/img/overview.svg',
)

const COLOR = {
  background: '#ffffff',
  ink: '#1f2328',
  muted: '#4b5563',
  untranslated: '#8c959f',
  intron: '#6e7781',
  protein: '#b6d4fe',
  structured: '#0b5fff',
  structuredText: '#0a4fd6',
  labAdded: '#f25c05',
  labAddedText: '#c2410c',
}

const WIDTH = 1000
const HEIGHT = 212
const ROW = 100
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

const GENE = { x: 30, utr: 16, utrGap: 4, intron: 28, coding: 167 }
const PROTEIN = { x: 395, width: 270 }
const STRUCTURED = { x: 462, width: 116 }

function structuredResidues() {
  const { mapper, entity } = runExample()
  const residues = Array.from({ length: entity.seq.length }, (_, i) =>
    mapper.structureToTranscript(structurePos(i)),
  ).filter(t => t !== undefined)
  return [residues[0]!, residues.at(-1)!] as const
}

function codingExons() {
  const { exonResidues } = runExample()
  const [first, last] = structuredResidues()
  const totalBases = EXONS.reduce((sum, exon) => sum + exon.end - exon.start, 0)
  let x = GENE.x + GENE.utr + GENE.utrGap
  return exonResidues.map(([from, to], i) => {
    const exon = EXONS[i]!
    const width = (GENE.coding * (exon.end - exon.start)) / totalBases
    const residues = to - from + 1
    const start = Math.max(first, from)
    const end = Math.min(last, to)
    const placed = {
      x,
      width,
      structuredFrom: x + (width * (start - from)) / residues,
      structuredTo: x + (width * (end - from + 1)) / residues,
    }
    x += width + GENE.intron
    return placed
  })
}

function text(
  x: number,
  y: number,
  fill: string,
  size: number,
  content: string,
  { anchor = 'middle', bold = false } = {},
) {
  const weight = bold ? ' font-weight="600"' : ''
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" text-anchor="${anchor}"${weight}>${content}</text>`
}

function arrow(from: number, to: number, name: string, converts: string[]) {
  const middle = (from + to) / 2
  return [
    `<line x1="${from}" y1="${ROW}" x2="${to}" y2="${ROW}" stroke="${COLOR.ink}" stroke-width="2" marker-start="url(#head)" marker-end="url(#head)"/>`,
    text(middle, ROW - 18, COLOR.ink, 16, name, { bold: true }),
    ...converts.map((line, i) =>
      text(middle, ROW + 24 + 17 * i, COLOR.muted, 13, line),
    ),
  ]
}

function gene() {
  const exons = codingExons()
  const geneEnd =
    GENE.x + 2 * (GENE.utr + GENE.utrGap) + GENE.coding + GENE.intron
  const utrs = [GENE.x, geneEnd - GENE.utr]
  const exonsMiddle = (exons[0]!.x + exons.at(-1)!.x + exons.at(-1)!.width) / 2
  return [
    text(GENE.x, 34, COLOR.muted, 15, 'gene', { anchor: 'start' }),
    `<line x1="${GENE.x}" y1="${ROW}" x2="${geneEnd}" y2="${ROW}" stroke="${COLOR.intron}" stroke-width="2"/>`,
    ...utrs.map(
      x =>
        `<rect x="${x}" y="${ROW - 4}" width="${GENE.utr}" height="8" rx="2" fill="${COLOR.untranslated}"/>`,
    ),
    ...exons.flatMap((exon, i) => [
      `<clipPath id="exon${i}"><rect x="${exon.x}" y="${ROW - 9}" width="${exon.width}" height="18" rx="5"/></clipPath>`,
      `<rect x="${exon.x}" y="${ROW - 9}" width="${exon.width}" height="18" rx="5" fill="${COLOR.protein}"/>`,
      `<rect x="${exon.structuredFrom}" y="${ROW - 9}" width="${exon.structuredTo - exon.structuredFrom}" height="18" fill="${COLOR.structured}" clip-path="url(#exon${i})"/>`,
    ]),
    ...utrs.map(x => text(x + GENE.utr / 2, ROW + 34, COLOR.muted, 13, 'UTR')),
    text(exonsMiddle, ROW + 34, COLOR.muted, 13, 'CDS'),
  ]
}

function protein() {
  const end = STRUCTURED.x + STRUCTURED.width
  return [
    text(PROTEIN.x, 34, COLOR.muted, 15, 'full-length protein', {
      anchor: 'start',
    }),
    `<rect x="${PROTEIN.x}" y="${ROW - 9}" width="${PROTEIN.width}" height="18" rx="6" fill="${COLOR.protein}"/>`,
    `<rect x="${STRUCTURED.x}" y="${ROW - 14}" width="${STRUCTURED.width}" height="28" rx="3" fill="${COLOR.structured}"/>`,
    `<path d="M${STRUCTURED.x} ${ROW + 26} V${ROW + 30} H${end} V${ROW + 24}" fill="none" stroke="${COLOR.structured}" stroke-width="2.5"/>`,
    text(
      STRUCTURED.x + STRUCTURED.width / 2,
      ROW + 52,
      COLOR.structuredText,
      15,
      'only this part has a structure',
      { bold: true },
    ),
    text(
      PROTEIN.x + PROTEIN.width - 6,
      ROW + 28,
      COLOR.muted,
      14,
      'no structure',
      {
        anchor: 'end',
      },
    ),
  ]
}

function structure() {
  return [
    text(842, 34, COLOR.muted, 15, '3D structure', { anchor: 'start' }),
    '<g transform="translate(676,-17) scale(0.5)">',
    `<path d="M244,344 C282,326 306,290 330,262" fill="none" stroke="${COLOR.labAdded}" stroke-width="14" stroke-linecap="round"/>`,
    `<path d="M330,262 C300,230 352,196 382,214 S420,268 450,244 S430,186 466,176 S530,196 512,232 S470,286 520,292 S580,260 560,226" fill="none" stroke="${COLOR.structured}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`,
    '</g>',
    text(796, 180, COLOR.labAddedText, 14, 'lab-added residues', {
      anchor: 'end',
      bold: true,
    }),
    text(
      796,
      198,
      COLOR.labAddedText,
      13,
      'not encoded by the gene, so unmapped',
      {
        anchor: 'end',
      },
    ),
  ]
}

export function renderOverviewFigure() {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="A gene's coding exons map to a full-length protein, only part of which has a 3D structure; p2s_mapper maps that part to the structure's chain" font-family="${SANS}">`,
    `<defs><marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L10,5 L0,10 z" fill="${COLOR.ink}"/></marker></defs>`,
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${COLOR.background}"/>`,
    ...gene(),
    ...arrow(276, 384, 'g2p_mapper', ['genome position', '↔ protein position']),
    ...protein(),
    ...arrow(678, 792, 'p2s_mapper', [
      'protein position',
      '↔ structure residue',
    ]),
    ...structure(),
    '</svg>',
    '',
  ].join('\n')
}

if (import.meta.main) {
  fs.writeFileSync(OVERVIEW_FIGURE, renderOverviewFigure())
}
