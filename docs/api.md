# API reference

Every export, grouped by job, with its signature and an example. For how the
pieces fit together, see [pipeline.md](pipeline.md); for the numbering rules,
see [coordinates.md](coordinates.md).

Conventions that hold everywhere:

- Positions are **0-based** unless a name or comment says otherwise. UniProt
  positions and author residue numbers are the exceptions, and are 1-based.
- Ranges are `{ start, end }`. A range of positions is half-open; a range of
  residue numbers (UniProt, author, "residues 102-292") is inclusive.
- A `PairwiseAlignment` has **row 0 = transcript, row 1 = structure**.
- Every network function takes an optional `FetchOptions` last, see
  [Fetch helpers](#fetch-helpers).

The signature blocks come from the compiler: `pnpm docs:api` rewrites each one
between its `GENERATED` markers, and `pnpm test` fails when one is stale.

- [Alignment](#alignment)
- [Coordinates](#coordinates)
- [Chain choice](#chain-choice)
- [SIFTS](#sifts)
- [Structure sources](#structure-sources)
- [URLs and formats](#urls-and-formats)
- [Fetch helpers](#fetch-helpers)

## Alignment

### Aligning two sequences

```ts
import { runLocalAlignment, scoredAlignment, smithWaterman } from 'p2s_mapper'

const pa = runLocalAlignment('MKVLAW', 'MKILA', 'needleman_wunsch')
pa.alns[0].seq // 'MKVLAW'
pa.alns[1].seq // 'MKILA-'
pa.consensus // '||:|| '

scoredAlignment('MKVLA', 'MKILA', 'smith_waterman').score // 21

smithWaterman('HEAGAWGHEE', 'PAWHEAE').alignedSeq1 // '-HEAGAWGHE--E'
```

<!-- GENERATED: runLocalAlignment scoredAlignment smithWaterman needlemanWunsch AlignmentResult selfScore alignmentTooLarge MAX_ALIGNMENT_CELLS -->

```ts
function runLocalAlignment(
  seq1: string,
  seq2: string,
  algorithm: AlignmentAlgorithm,
): PairwiseAlignment

function scoredAlignment(
  seq1: string,
  seq2: string,
  algorithm: AlignmentAlgorithm,
): { alignment: PairwiseAlignment; score: number }

function smithWaterman(
  seq1: string,
  seq2: string,
  gapOpen?: number,
  gapExtend?: number,
): AlignmentResult

function needlemanWunsch(
  seq1: string,
  seq2: string,
  gapOpen?: number,
  gapExtend?: number,
): AlignmentResult

interface AlignmentResult {
  alignedSeq1: string
  alignedSeq2: string
  score: number
}

function selfScore(seq: string): number

function alignmentTooLarge(len1: number, len2: number): boolean

const MAX_ALIGNMENT_CELLS: 40000000
```

<!-- /GENERATED -->

- Both aligners score with BLOSUM62 and affine gaps: open -10, extend -0.5, the
  EMBOSS defaults.
- `runLocalAlignment` takes the transcript first and the structure second, which
  is what puts them in rows 0 and 1. Despite the name it runs either algorithm.
- Both rows always spell their whole sequences. Smith-Waterman leaves the
  residues outside its local alignment hanging off the ends against gaps, as in
  the `smithWaterman` line above, so every coordinate map works on a local
  alignment too.
- The consensus row marks identities with `|`, positive BLOSUM62 pairs with `:`
  and everything else with a space.
- The DP table is capped at `MAX_ALIGNMENT_CELLS` (about 40 MB and a second of
  work). Past it the aligners throw; check `alignmentTooLarge` first when there
  are several candidates and some may be huge.
- `selfScore` is the score of a sequence against itself without gaps, the score
  an exact match reports.

### Algorithm names

```ts
import {
  ALIGNMENT_ALGORITHM_LABELS,
  coerceAlignmentAlgorithm,
} from 'p2s_mapper'

const algorithm = coerceAlignmentAlgorithm('needleman_wunsch')
ALIGNMENT_ALGORITHM_LABELS[algorithm] // 'Needleman-Wunsch'
coerceAlignmentAlgorithm('blast') // 'smith_waterman', the default
```

<!-- GENERATED: AlignmentAlgorithm ALIGNMENT_ALGORITHMS DEFAULT_ALIGNMENT_ALGORITHM ALIGNMENT_ALGORITHM_VALUES ALIGNMENT_ALGORITHM_LABELS coerceAlignmentAlgorithm -->

```ts
type AlignmentAlgorithm = 'needleman_wunsch' | 'smith_waterman'

const ALIGNMENT_ALGORITHMS: {
  readonly NEEDLEMAN_WUNSCH: 'needleman_wunsch'
  readonly SMITH_WATERMAN: 'smith_waterman'
}

const DEFAULT_ALIGNMENT_ALGORITHM: AlignmentAlgorithm

const ALIGNMENT_ALGORITHM_VALUES: AlignmentAlgorithm[]

const ALIGNMENT_ALGORITHM_LABELS: Record<AlignmentAlgorithm, string>

function coerceAlignmentAlgorithm(value: string): AlignmentAlgorithm
```

<!-- /GENERATED -->

`coerceAlignmentAlgorithm` parses an untrusted name, such as a URL parameter,
and falls back to Smith-Waterman.

### The alignment object

**The row order is a contract**: row 0 is the transcript, row 1 is the
structure. Nothing in the type enforces it, and swapping the rows silently
inverts every map, so read them through the accessors rather than by index.

```ts
import {
  pairwiseAlignmentProblem,
  pairwiseAlignmentSequenceProblem,
  structureAlignedSeq,
  transcriptAlignedSeq,
} from 'p2s_mapper'
import type { PairwiseAlignment } from 'p2s_mapper'

const imported: PairwiseAlignment = {
  consensus: '||:|| ',
  alns: [
    { id: 'transcript', seq: 'MKVLAW' },
    { id: 'chain A', seq: 'MKILA-' },
  ],
}
transcriptAlignedSeq(imported) // 'MKVLAW'
structureAlignedSeq(imported) // 'MKILA-'

pairwiseAlignmentProblem(imported) // undefined: both rows the same length
pairwiseAlignmentSequenceProblem(imported, 'MKVLA', 'MKILA')
// "The first sequence is not this transcript's translation (6 vs 5 residues)"
```

<!-- GENERATED: PairwiseAlignment AlignmentRow transcriptAlignedSeq structureAlignedSeq alignmentLength pairwiseAlignmentProblem pairwiseAlignmentSequenceProblem -->

```ts
interface PairwiseAlignment {
  consensus: string
  alns: readonly [AlignmentRow, AlignmentRow]
}

interface AlignmentRow {
  id: string
  seq: string
}

function transcriptAlignedSeq(pa: PairwiseAlignment): string

function structureAlignedSeq(pa: PairwiseAlignment): string

function alignmentLength(pa: PairwiseAlignment): number

function pairwiseAlignmentProblem(pa: PairwiseAlignment): string | undefined

function pairwiseAlignmentSequenceProblem(
  pa: PairwiseAlignment,
  transcript: string,
  structure: string,
): string | undefined
```

<!-- /GENERATED -->

Run both checks on an alignment from outside the package. The first catches
ragged rows; the second catches rows that are not the transcript and chain being
mapped, such as an alignment made against another isoform, which would shift
every position after the first difference. Each returns a message to show, or
`undefined`.

### Unmapping residues

```ts
import {
  mappedStructureIdentity,
  runLocalAlignment,
  unmapStructurePositions,
} from 'p2s_mapper'

const pa = runLocalAlignment('MKVLAW', 'MKILA', 'needleman_wunsch')
mappedStructureIdentity(pa)
// Map { 0 => true, 1 => true, 2 => false, 3 => true, 4 => true }

const trimmed = unmapStructurePositions(pa, new Set([2]))
trimmed.alns[0].seq // 'MKV-LAW'
trimmed.alns[1].seq // 'MK-ILA-'
```

<!-- GENERATED: mappedStructureIdentity unmapStructurePositions -->

```ts
function mappedStructureIdentity(pa: PairwiseAlignment): Map<number, boolean>

function unmapStructurePositions(
  pa: PairwiseAlignment,
  positions: ReadonlySet<number>,
): PairwiseAlignment
```

<!-- /GENERATED -->

- `mappedStructureIdentity` lists every mapped structure position and whether
  its pair is identical, so a host can flag the mismatches.
- `unmapStructurePositions` takes positions out of their columns, so both rows
  still spell their sequences and those residues map to nothing. It returns the
  same object when nothing changes. SIFTS trimming and `keepSharedStretches`
  both work through it.

### Two isoforms of one protein

```ts
import { sharedIsoformResidues } from 'p2s_mapper'

// the second isoform carries a four-residue insert after residue 10
const shared = sharedIsoformResidues(
  'MKTAYIAKQRQISFVKSHFSRQ',
  'MKTAYIAKQRDEFGHISFVKSHFSRQ',
)
shared.get(9) // 9
shared.get(10) // undefined: Q sits opposite the insert's D
shared.get(11) // 15
```

<!-- GENERATED: sharedIsoformResidues sharedResidueMap keepSharedStretches -->

```ts
function sharedIsoformResidues(from: string, to: string): Map<number, number>

function sharedResidueMap(a: string, b: string): Map<number, number>

function keepSharedStretches(pa: PairwiseAlignment): PairwiseAlignment
```

<!-- /GENERATED -->

A residue carries from one isoform to the other only inside a stretch the two
spell letter for letter: one of at least 10 residues, or one of at least 3
bounded by gaps or sequence ends, the shape a short shared exon takes. A lone
substitution between two kept stretches carries too. So a mutually exclusive
exon (PKM's 9 and 10) maps nothing, although it aligns column for column.

`keepSharedStretches` applies the rule to a transcript aligned to another
isoform's entry. Don't apply it to a structure, where a mismatch is usually a
construct's point mutation at the right place in the fold.

### Quality

```ts
import {
  alignmentQuality,
  chooseMappedEntity,
  describeAlignmentQuality,
  describeCoveredRange,
  describeTranscriptCoverage,
  isLowSimilarity,
} from 'p2s_mapper'

const transcript = 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDP'
const chain = 'GSHMSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQW'
const picked = chooseMappedEntity(transcript, [chain], 'smith_waterman')!

const q = alignmentQuality(picked.alignment)
q.identityOverShorter // 0.907: 39 of the chain's 43
isLowSimilarity(q) // false
describeAlignmentQuality(q) // '98% identity over 40 of 43 structure residues'
describeTranscriptCoverage(q) // '98% identity, 40 of 58 transcript residues covered'
describeCoveredRange(q) // 'covers transcript residues 14–53'
```

<!-- GENERATED: alignmentQuality AlignmentQuality isLowSimilarity LOW_IDENTITY_OVER_SHORTER SHORT_ALIGNMENT_RESIDUES SHORT_ALIGNMENT_IDENTITY MIN_IDENTICAL_RESIDUES describeAlignmentQuality describeTranscriptCoverage describeCoveredRange -->

```ts
function alignmentQuality(pa: PairwiseAlignment): AlignmentQuality

interface AlignmentQuality {
  /** columns carrying a residue on both rows, i.e. mapped positions */
  aligned: number
  identical: number
  transcriptLength: number
  structureLength: number
  /** identical over aligned; 0 when nothing aligned */
  identity: number
  /** identical over the shorter of the two sequences: the statistic that
   * separates a real match from a chance local alignment, see below */
  identityOverShorter: number
  /** aligned over the structure's length */
  structureCoverage: number
  /** first and last transcript residue the alignment covers, 1-based
   * inclusive; 0 when nothing aligned. A structure is usually a fragment, and
   * which part of the protein it holds is the reader's first question. */
  transcriptStart: number
  transcriptEnd: number
}

function isLowSimilarity(q: AlignmentQuality): boolean

const LOW_IDENTITY_OVER_SHORTER: 0.3

const SHORT_ALIGNMENT_RESIDUES: 20

const SHORT_ALIGNMENT_IDENTITY: 0.8

const MIN_IDENTICAL_RESIDUES: 5

function describeAlignmentQuality(q: AlignmentQuality): string

function describeTranscriptCoverage(q: AlignmentQuality): string

function describeCoveredRange(q: AlignmentQuality): string | undefined
```

<!-- /GENERATED -->

Identity over the aligned columns flatters every local alignment, chance ones
included, so `isLowSimilarity` judges `identityOverShorter` instead:

- At 20 identical residues or more, the floor is 0.3.
- Under 20, it rises to 0.8, since a short real match (a bound peptide) is
  identical or one off.
- Under 5, nothing passes.

Nothing blocks on the verdict; the host decides what to show.
`describeCoveredRange` is `undefined` when the structure covers the whole
translation. [faq.md](faq.md#what-if-the-structure-is-not-my-protein) has the
measurements behind the thresholds.

## Coordinates

### The mapper

```ts
import {
  chooseMappedEntity,
  makeCoordinateMapper,
  structurePos,
  transcriptPos,
  transcriptRangeToStructureRange,
} from 'p2s_mapper'

const transcript = 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDP'
const chain = 'GSHMSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQW'
const { alignment } = chooseMappedEntity(transcript, [chain], 'smith_waterman')!
const mapper = makeCoordinateMapper(alignment)

mapper.transcriptToStructure(transcriptPos(16)) // 6: Q in both
mapper.structureToTranscript(structurePos(0)) // undefined: the GSH tag
mapper.transcriptToAlignment(transcriptPos(16)) // 19

// a UniProt-style feature, residues 17-30 inclusive
transcriptRangeToStructureRange(mapper, { start: 17, end: 30 })
// { start: 6, end: 20 }
```

<!-- GENERATED: makeCoordinateMapper CoordinateMapper CoordinateMaps transcriptRangeToStructureRange -->

```ts
function makeCoordinateMapper(
  pairwiseAlignment: PairwiseAlignment,
): CoordinateMapper

interface CoordinateMapper {
  structureToTranscript: (p: StructurePos) => TranscriptPos | undefined
  transcriptToStructure: (p: TranscriptPos) => StructurePos | undefined
  structureToAlignment: (p: StructurePos) => AlignmentCol | undefined
  alignmentToStructure: (c: AlignmentCol) => StructurePos | undefined
  transcriptToAlignment: (p: TranscriptPos) => AlignmentCol | undefined
  alignmentToTranscript: (c: AlignmentCol) => TranscriptPos | undefined
  /**
   * Raw lookup tables, for consumers that iterate the whole map rather than
   * convert a single position (e.g. per-residue track rendering, selection of
   * all aligned residues). Plain numbers — prefer the typed methods above for
   * point conversions.
   */
  readonly maps: CoordinateMaps
}

interface CoordinateMaps {
  structureSeqToTranscriptSeqPosition: Record<number, number>
  transcriptSeqToStructureSeqPosition: Record<number, number>
  structurePositionToAlignmentMap: Record<number, number>
  transcriptPositionToAlignmentMap: Record<number, number>
  alignmentToStructurePosition: Record<number, number>
  alignmentToTranscriptPosition: Record<number, number>
}

function transcriptRangeToStructureRange(
  mapper: CoordinateMapper,
  range: { start: number; end: number },
): { start: number; end: number } | undefined
```

<!-- /GENERATED -->

- Build the mapper once per alignment. Every method returns `undefined` for a
  position the other side lacks: a gap, a tag, an unmodelled loop.
- `maps` holds the raw tables, unbranded, for code that walks a whole map, such
  as painting every aligned residue.
- `transcriptRangeToStructureRange` takes 1-based inclusive transcript residues
  and returns a 0-based half-open structure range. It skips residues the
  structure lacks, so a feature running past a fragment's end clamps to the last
  modelled residue. It returns `undefined` when none of the range aligns.

### Branded positions

```ts
import {
  chooseMappedEntity,
  makeCoordinateMapper,
  structurePos,
  transcriptPos,
} from 'p2s_mapper'

const { alignment } = chooseMappedEntity('MKVLA', ['MKILA'], 'smith_waterman')!
const mapper = makeCoordinateMapper(alignment)

mapper.transcriptToStructure(transcriptPos(3)) // 3
// @ts-expect-error a structure position is not a transcript position
mapper.transcriptToStructure(structurePos(3))
```

<!-- GENERATED: StructurePos TranscriptPos AlignmentCol structurePos transcriptPos alignmentCol -->

```ts
type StructurePos = number & {
  readonly __brand: 'StructurePos'
}

type TranscriptPos = number & {
  readonly __brand: 'TranscriptPos'
}

type AlignmentCol = number & {
  readonly __brand: 'AlignmentCol'
}

function structurePos(n: number): StructurePos

function transcriptPos(n: number): TranscriptPos

function alignmentCol(n: number): AlignmentCol
```

<!-- /GENERATED -->

A branded position is a plain number at runtime. Brand a raw number where it
enters, such as a Mol\* pick or a hover event, and the compiler rejects passing
it to the wrong space from then on.

### Raw maps

```ts
import {
  invertMap,
  runLocalAlignment,
  structurePositionToAlignmentMap,
  structureSeqVsTranscriptSeqMap,
} from 'p2s_mapper'

const pa = runLocalAlignment('MKVLAW', 'MKILA', 'needleman_wunsch')
structureSeqVsTranscriptSeqMap(pa).structureSeqToTranscriptSeqPosition
// { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 }
structurePositionToAlignmentMap(pa) // { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4 }
invertMap({ 0: 5, 1: 6 }) // { 5: 0, 6: 1 }
```

<!-- GENERATED: structureSeqVsTranscriptSeqMap structurePositionToAlignmentMap transcriptPositionToAlignmentMap invertMap -->

```ts
function structureSeqVsTranscriptSeqMap(pairwiseAlignment: PairwiseAlignment): {
  structureSeqToTranscriptSeqPosition: Record<number, number>
  transcriptSeqToStructureSeqPosition: Record<number, number>
}

function structurePositionToAlignmentMap(
  pairwiseAlignment: PairwiseAlignment,
): Record<number, number>

function transcriptPositionToAlignmentMap(
  pairwiseAlignment: PairwiseAlignment,
): Record<number, number>

function invertMap(arg: Record<number, number>): Record<number, number>
```

<!-- /GENERATED -->

These are the tables `makeCoordinateMapper` builds from; prefer the mapper.
`structureSeqVsTranscriptSeqMap` throws on an alignment
`pairwiseAlignmentProblem` rejects.

### Genome positions

```ts
import { genomeToTranscriptSeqMapping } from 'g2p_mapper'
import { codonGenomeSpan } from 'p2s_mapper'

const { p2gCodon } = genomeToTranscriptSeqMapping({
  refName: 'chr1',
  start: 99,
  end: 205,
  strand: 1,
  subfeatures: [
    { refName: 'chr1', start: 99, end: 103, type: 'CDS', phase: 0 },
    { refName: 'chr1', start: 200, end: 205, type: 'CDS', phase: 2 },
  ],
})
codonGenomeSpan(p2gCodon, 1) // [102, 202]: the codon spans the intron
codonGenomeSpan(p2gCodon, 9) // undefined
```

<!-- GENERATED: codonGenomeSpan -->

```ts
function codonGenomeSpan(
  p2gCodon: Record<number, number[]>,
  proteinPos: number,
): readonly [number, number] | undefined
```

<!-- /GENERATED -->

`codonGenomeSpan` collapses a codon's genomic pieces into the one 0-based
half-open span that encloses them, for navigating to or highlighting a residue
on the genome. The pieces themselves come from g2p_mapper's `getCodonRanges`.

### Stop codons

```ts
import { stripAllStopCodons, stripStopCodon } from 'p2s_mapper'

stripStopCodon('MK*V**') // 'MK*V'
stripAllStopCodons('MK*V**') // 'MKV'
```

<!-- GENERATED: stripStopCodon stripAllStopCodons -->

```ts
function stripStopCodon(seq: string): string

function stripAllStopCodons(seq: string): string
```

<!-- /GENERATED -->

Use `stripStopCodon` on anything you map. An interior `*` holds a real codon's
place (a mis-annotated CDS, a selenocysteine), and deleting it would shift every
later residue against g2p_mapper's codon numbering. `stripAllStopCodons` is for
a sequence sent to an outside search such as Foldseek, where `*` is not a valid
character and no position depends on the result.

## Chain choice

### Picking the entity

```ts
import { chooseMappedEntity } from 'p2s_mapper'

const transcript = 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDP*'
const picked = chooseMappedEntity(
  transcript,
  [
    { seq: 'TTTCCTAGACTTGCCCAATTA', nucleicAcid: true },
    { seq: 'GSHMSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQW' },
  ],
  'smith_waterman',
)
picked?.index // 1
picked?.matches // 39
picked?.explained // 0.8125, i.e. 39 / (43 + 5)
```

<!-- GENERATED: chooseMappedEntity EntityCandidate EntitySelection ScoredAlignment alignTranscriptToEntity explainedFraction interactionMatchesMappedEntity -->

```ts
function chooseMappedEntity(
  transcript: string,
  entities: readonly (string | EntityCandidate)[],
  algorithm: AlignmentAlgorithm,
): EntitySelection | undefined

interface EntityCandidate {
  seq: string
  nucleicAcid?: boolean
}

interface EntitySelection extends ScoredAlignment {
  /** index into the candidate array of the entity that is the transcript's */
  index: number
}

interface ScoredAlignment {
  /** alignment of the transcript against the entity (stop codons stripped on
   * both sides, matching the rest of the mapping pipeline) */
  alignment: PairwiseAlignment
  /** identical aligned residues */
  matches: number
  /** identical residues over the shorter sequence, the score that picks the
   * entity; see `explainedFraction` */
  explained: number
  /** the alignment's BLOSUM62 score, gap penalties included */
  score: number
}

function alignTranscriptToEntity(
  transcript: string,
  entitySeq: string,
  algorithm: AlignmentAlgorithm,
): ScoredAlignment | undefined

function explainedFraction(
  matches: number,
  transcriptLength: number,
  entityLength: number,
): number

function interactionMatchesMappedEntity(
  entityId: string,
  mappedEntityId: string | undefined,
): boolean
```

<!-- /GENERATED -->

`chooseMappedEntity` picks in two tiers:

1. A chain whose sequence is **identical** to the transcript's wins outright,
   with no alignment search.
2. Otherwise it aligns the transcript to every distinct protein sequence and
   keeps the highest `explained`: identical residues over the shorter of the two
   sequences, plus a 5-residue pseudocount (`explainedFraction`). DNA and RNA
   chains are skipped; pass them as `{ seq, nucleicAcid: true }`, because their
   letters are amino-acid letters too.

The best match wins even when it is poor, so check it with
[`isLowSimilarity`](#quality). The result is `undefined` only when there is
nothing to map: an empty transcript, or no protein chain. Stop codons are
stripped from both sides. [pipeline.md](pipeline.md#why-the-shorter-sequence)
explains why the score divides by the shorter sequence.

`alignTranscriptToEntity` scores one pair, which is how to honour a chain the
user chose. It returns `undefined` for a pair over the size cap.

`interactionMatchesMappedEntity` says whether a hover or click on an entity may
drive genome navigation: only the mapped entity may, since any other chain's
positions would go through the wrong alignment. With no mapped entity, every
chain stays interactive.

### Reading a loaded Mol\* model

```ts
import { chooseMappedEntity, entityLabel, extractEntities } from 'p2s_mapper'
import type { StructureModel } from 'p2s_mapper'

// e.g. what Mol*'s plugin.builders.structure.createModel resolves to
declare const model: StructureModel
declare const transcript: string

const entities = extractEntities(model) ?? []
const picked = chooseMappedEntity(transcript, entities, 'smith_waterman')
const entity = picked ? entities[picked.index] : undefined
if (entity) {
  entityLabel(entity) // e.g. 'Chain A (43 aa)'
}
```

<!-- GENERATED: extractEntities Entity StructureModel Column extractStructureSequences entityLabel oneLetterSequence fillAuthSeqIds -->

```ts
function extractEntities(model: StructureModel): Entity[] | undefined

interface Entity {
  /** mmCIF entity id, molstar's own bookkeeping */
  entityId: string
  /** one letter per residue, observed or not */
  seq: string
  /** molstar `label_seq_id` per position of `seq` */
  seqIds: number[]
  /** author chain ids carrying this entity, e.g. ['A', 'B'] for a homodimer:
   * what a user recognises from the PDB entry page */
  chains: string[]
  /** DNA, RNA or a hybrid, by molstar's entity subtype. Its letters spell
   * amino acids too (A, C, G, T, U), so it is kept out of the alignment
   * rather than left to score low. */
  nucleicAcid?: boolean
  /** `auth_seq_id` per position: the depositors' numbering, which papers cite
   * (1TUP's position 154 is R248) and Mol*'s hover shows. Display only;
   * address Mol* through `seqIds`. Absent when the model has no atomic
   * hierarchy. See `residueNumber`. */
  authSeqIds?: number[]
}

interface StructureModel {
  obj?: {
    data: {
      entities?: {
        subtype: Column<string>
        getEntityIndex(id: string): number
      }
      sourceData?: {
        data: unknown
      }
      sequence: {
        sequences: readonly {
          entityId: string
          sequence: {
            code: {
              toArray(): ArrayLike<string>
            }
            seqId: {
              toArray(): ArrayLike<number>
            }
          }
        }[]
      }
      atomicHierarchy?: {
        chains: {
          label_entity_id: Column<string>
          auth_asym_id: Column<string>
        }
        residues?: {
          label_seq_id: Column<number>
          auth_seq_id: Column<number>
        }
        residueAtomSegments?: {
          offsets: ArrayLike<number>
          count: number
        }
        chainAtomSegments?: {
          index: ArrayLike<number>
        }
      }
    }
  }
}

interface Column<T> {
  rowCount: number
  value(row: number): T
}

function extractStructureSequences(model: StructureModel): string[] | undefined

function entityLabel(entity: Entity): string

function oneLetterSequence(
  codes: ArrayLike<string>,
  canonical: string | undefined,
): string

function fillAuthSeqIds(
  seqIds: number[],
  observed: Map<number, number> | undefined,
): number[]
```

<!-- /GENERATED -->

- `StructureModel` is the narrow slice of a Mol\* model these functions read.
  Pass the Mol\* object itself; the package never imports Mol\*.
- An `Entity` passes straight to `chooseMappedEntity`, since it carries `seq`
  and `nucleicAcid`.
- `extractStructureSequences` returns just the protein chains' sequences.
- The sequence comes from Mol\*'s `sequence.code`, never `sequence.label`.
  `label` spells MSE, TPO and ACE by component id, so the string outgrows
  `seqIds` and every later position addresses the wrong residue.
  `oneLetterSequence` then fills each `X` from the mmCIF canonical sequence:
  `oneLetterSequence(['M', 'X', 'K'], 'MMK')` is `'MMK'`.
- `fillAuthSeqIds` numbers unobserved residues by the offset of the nearest
  observed one, so a disordered loop counts on the way the paper does.

### Residue numbering

```ts
import {
  makeLabelSeqIdIndex,
  rangeToLabelSeqIds,
  residueNumber,
  residueRangeToPositions,
  toLabelSeqIds,
} from 'p2s_mapper'
import type { Entity } from 'p2s_mapper'

const entity: Entity = {
  entityId: '1',
  seq: 'GSHMSQETF',
  seqIds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  authSeqIds: [12, 13, 14, 15, 16, 17, 18, 19, 20],
  chains: ['A'],
}

// structure position -> Mol*
toLabelSeqIds(entity, [4, 99]) // [5]: unknown positions are dropped
rangeToLabelSeqIds(entity, { start: 3, end: 6 }) // [4, 5, 6]

// Mol* -> structure position
makeLabelSeqIdIndex(entity).get(5) // 4

// structure position <-> the number a paper cites
residueNumber(entity, 4) // 16
residueRangeToPositions(entity, { start: 15, end: 17 }) // { start: 3, end: 6 }
```

<!-- GENERATED: toLabelSeqIds rangeToLabelSeqIds makeLabelSeqIdIndex residueNumber residueRangeToPositions -->

```ts
function toLabelSeqIds(
  entity: Entity | undefined,
  positions: Iterable<number>,
): number[]

function rangeToLabelSeqIds(
  entity: Entity | undefined,
  range: { start: number; end: number } | undefined,
): number[]

function makeLabelSeqIdIndex(entity: Entity | undefined): Map<number, number>

function residueNumber(entity: Entity | undefined, pos: number): number

function residueRangeToPositions(
  entity: Entity | undefined,
  range: { start: number; end: number },
): { start: number; end: number } | undefined
```

<!-- /GENERATED -->

Cross into Mol\* only through `seqIds`. `label_seq_id` equals position + 1 only
for a file with `entity_poly_seq` or SEQRES; a SEQRES-less PDB numbers by author
numbering and leaves holes. [coordinates.md](coordinates.md) has the full rules.
`residueNumber` and `residueRangeToPositions` are for display and for user input
such as "R248"; never feed their numbers back into a map.

### Per-residue confidence

```ts
import { extractPerResidueConfidence, looksLikePlddt } from 'p2s_mapper'
import type { ConfidenceModel, Entity } from 'p2s_mapper'

declare const model: ConfidenceModel
declare const entity: Entity

const confidence = extractPerResidueConfidence(model)?.find(
  c => c.entityId === entity.entityId,
)
const plddt = entity.seqIds.flatMap(id => {
  const value = confidence?.byLabelSeqId.get(id)
  return value === undefined ? [] : [value]
})
if (looksLikePlddt(plddt)) {
  // draw a confidence track, one value per observed residue
}
```

<!-- GENERATED: extractPerResidueConfidence ConfidenceModel EntityConfidence looksLikePlddt -->

```ts
function extractPerResidueConfidence(
  model: ConfidenceModel,
): EntityConfidence[] | undefined

interface ConfidenceModel {
  obj?: {
    data: {
      atomicConformation: {
        B_iso_or_equiv: {
          value: (row: number) => number
        }
      }
      atomicHierarchy: {
        residueAtomSegments: {
          offsets: ArrayLike<number>
          count: number
        }
        chainAtomSegments: {
          index: ArrayLike<number>
        }
        chains: {
          label_entity_id: {
            value: (row: number) => string
          }
        }
        residues: {
          label_seq_id: {
            value: (row: number) => number
          }
        }
      }
    }
  }
}

interface EntityConfidence {
  entityId: string
  byLabelSeqId: Map<number, number>
}

function looksLikePlddt(values: number[] | undefined): values is number[]
```

<!-- /GENERATED -->

AlphaFold stores pLDDT in the B-factor column, so this reads the first atom's
B-factor of each residue. The values are keyed by `label_seq_id` because the
atomic hierarchy holds only observed residues. For an experimental entry the
column holds real B-factors, not confidence, so check the experimental method
before drawing it; `looksLikePlddt` only rejects a constant or out-of-range
column.

### Isoforms

```ts
import { classifyIsoforms, selectBestTranscript } from 'p2s_mapper'

const isoforms = [
  {
    id: 'NM_000546',
    seq: 'MEEPQSDPSVEPPLSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQWFTEDP*',
  },
  { id: 'fragment', seq: 'GSHMSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQW' },
  { id: 'noncoding' },
]
const structureSequence = 'GSHMSQETFSDLWKLLPENNVLSPLPSQAMDDLMLSPDDIEQW'

classifyIsoforms({ isoforms, structureSequence })
// {
//   matches: [{ id: 'fragment', length: 43 }],
//   nonMatches: [{ id: 'NM_000546', length: 59, identical: 39, score: 210 }],
//   noData: ['noncoding'],
// }
selectBestTranscript({ isoforms, structureSequence }) // 'fragment'
```

<!-- GENERATED: classifyIsoforms selectBestTranscript pickStructureSequence Isoform RankedIsoform ClassifiedIsoforms -->

```ts
function classifyIsoforms(options: {
  isoforms: readonly Isoform[]
  structureSequence?: string
}): ClassifiedIsoforms

function selectBestTranscript(args: {
  isoforms: readonly Isoform[]
  structureSequence?: string
}): string | undefined

function pickStructureSequence(
  structureSequences: string[] | undefined,
  isoforms: readonly Isoform[] | undefined,
): string | undefined

interface Isoform {
  id: string
  seq?: string
}

interface RankedIsoform {
  id: string
  length: number
  /** identical residues against the structure, for an isoform that does not
   * match it exactly; undefined with no structure to compare to */
  identical?: number
  /** that alignment's score, which is what ranks non-matching isoforms */
  score?: number
}

interface ClassifiedIsoforms {
  /** translates to exactly the structure's sequence, longest first */
  matches: RankedIsoform[]
  /** translates to something else, best-aligning first */
  nonMatches: RankedIsoform[]
  /** ids of the isoforms with no translation */
  noData: string[]
}
```

<!-- /GENERATED -->

An isoform that translates to exactly the structure's sequence wins. The rest
rank by alignment score, then identical residues, then length. The score leads
because an isoform carrying an exon the structure lacks still aligns every
structure residue, across a gap (1MH1 against Rac1 and Rac1b).

`pickStructureSequence` chooses the chain to rank against: one some isoform
translates to exactly, else the one `chooseMappedEntity` maps the longest
isoform to. Never just the first chain, which on 1H26 is CDK2 rather than p53.

## SIFTS

SIFTS is PDBe's curated UniProt ↔ structure alignment. The residue mapping
itself always comes from the package's own alignment; SIFTS places UniProt
annotations, drops fusion partners and supplies author numbering.

### Fetching

```ts
import { fetchUniProtStructureMappings } from 'p2s_mapper'

const mappings = await fetchUniProtStructureMappings('1tup')
// [{
//   accession: 'P04637',
//   name: 'P53_HUMAN',
//   segments: [
//     { entityId: '3', chainId: 'A', unpStart: 94, unpEnd: 312,
//       structStart: 0, structEnd: 218, authorStart: 94 },
//     ...chains B and C
//   ],
// }]
```

<!-- GENERATED: fetchUniProtStructureMappings parseUniProtStructureMappings pdbeSiftsUrl UniProtStructureMapping UniProtStructureSegment -->

```ts
function fetchUniProtStructureMappings(
  pdbId: string,
  opts?: FetchOptions,
): Promise<UniProtStructureMapping[]>

function parseUniProtStructureMappings(json: unknown): UniProtStructureMapping[]

function pdbeSiftsUrl(pdbId: string): string

interface UniProtStructureMapping {
  accession: string
  /** UniProt entry name, e.g. "P53_HUMAN" */
  name?: string
  segments: UniProtStructureSegment[]
}

interface UniProtStructureSegment {
  entityId: string
  /** author chain id, when the response names it */
  chainId?: string
  unpStart: number
  unpEnd: number
  structStart: number
  structEnd: number
  /** the endpoints' author residue numbers, the numbering a paper cites and a
   * Mol* hover shows; absent when the response omits them */
  authorStart?: number
  authorEnd?: number
}
```

<!-- /GENERATED -->

The fetch retries twice, within a 20-second deadline, except on a 4xx: PDBe
answers 404 for an entry with no UniProt mapping (DNA-only, obsolete), and that
answer will not change. `struct*` are 0-based inclusive positions, the package's
own; `unp*` are 1-based UniProt positions.

### Placing UniProt features

```ts
import {
  chooseUniProtMappingForEntity,
  fetchUniProtStructureMappings,
  makeUniProtPositionMap,
} from 'p2s_mapper'

const mappings = await fetchUniProtStructureMappings('1tup')
const mapping = chooseUniProtMappingForEntity(mappings, {
  entityId: '3',
  chains: ['A', 'B', 'C'],
})
const toStructure = makeUniProtPositionMap(mapping?.segments ?? [])
toStructure(248) // 154: UniProt R248 is structure position 154
toStructure(50) // undefined: outside the construct
```

<!-- GENERATED: chooseUniProtMappingForEntity SegmentEntity makeUniProtPositionMap identityUniProtPositionMap MapUniProtPosition -->

```ts
function chooseUniProtMappingForEntity(
  mappings: UniProtStructureMapping[],
  entity: SegmentEntity | undefined,
): UniProtStructureMapping | undefined

interface SegmentEntity {
  entityId: string
  chains: readonly string[]
}

function makeUniProtPositionMap(
  segments: UniProtStructureSegment[],
): MapUniProtPosition

function identityUniProtPositionMap(uniprotPos: number): number | undefined

type MapUniProtPosition = (uniprotPos: number) => number | undefined
```

<!-- /GENERATED -->

Pass the entity you mapped the transcript to; an `Entity` from `extractEntities`
fits `SegmentEntity`. A heteromer maps each chain to its own accession, and when
several accessions cover one entity (a chimera) the one covering the most
residues wins. For an AlphaFold model, whose sequence is the UniProt sequence,
use `identityUniProtPositionMap` instead of asking SIFTS.

### Trimming fusion partners

```ts
import {
  fetchUniProtStructureMappings,
  fusionPartnerPositions,
  mappedStructureIdentity,
  unmapStructurePositions,
} from 'p2s_mapper'
import type { Entity, PairwiseAlignment } from 'p2s_mapper'

declare const alignment: PairwiseAlignment
declare const entity: Entity

const mappings = await fetchUniProtStructureMappings('2rh1')
const partners = fusionPartnerPositions(
  mappings,
  entity,
  mappedStructureIdentity(alignment),
)
const trimmed = unmapStructurePositions(alignment, partners)
```

<!-- GENERATED: fusionPartnerPositions -->

```ts
function fusionPartnerPositions(
  mappings: UniProtStructureMapping[],
  entity: SegmentEntity | undefined,
  mapped: ReadonlyMap<number, boolean>,
): Set<number>
```

<!-- /GENERATED -->

Local alignment bridges a fusion boundary: on 2RH1 it scatters 33 receptor
residues onto T4 lysozyme. `fusionPartnerPositions` returns the mapped positions
SIFTS gives a protein other than the transcript's. The transcript's own
accession is the one whose covered positions are most often identical. Unless it
reaches half identity, the transcript is taken to be neither protein and nothing
is unmapped. Residues SIFTS gives no accession, such as tags, stay mapped.

### Author numbering

```ts
import {
  fetchUniProtStructureMappings,
  segmentsForAccession,
  toAuthorRange,
} from 'p2s_mapper'

const mappings = await fetchUniProtStructureMappings('2hhb')
toAuthorRange(segmentsForAccession(mappings, 'P68871'), { start: 2, end: 10 })
// { start: 1, end: 9, chain: 'B', shift: -1 }
```

<!-- GENERATED: segmentsForAccession toAuthorRange AuthorRange -->

```ts
function segmentsForAccession(
  mappings: readonly {
    accession: string
    segments: UniProtStructureSegment[]
  }[],
  accession: string,
): UniProtStructureSegment[]

function toAuthorRange(
  segments: readonly UniProtStructureSegment[],
  range: { start: number; end: number },
): AuthorRange | undefined

interface AuthorRange {
  start: number
  end: number
  chain: string
  /** author number minus UniProt number in the chosen segment */
  shift: number
}
```

<!-- /GENERATED -->

The author numbering is what a paper cites and a viewer lights a named residue
by, and it need not match UniProt's: haemoglobin numbers from the mature
protein, so author residue 1 is UniProt residue 2. The segment overlapping most
of the range decides the shift. The result is `undefined` when no chain covers
the range, or SIFTS gave no author numbers.

## Structure sources

### UniProt search

```ts
import { searchUniProtEntries } from 'p2s_mapper'

const { entries, attemptedCount, failedCount } = await searchUniProtEntries({
  recognizedIds: ['GeneID:7157'],
  geneName: 'TP53',
  organismId: 9606,
})
entries[0]
// { accession: 'P04637', id: 'P53_HUMAN', geneName: 'TP53',
//   organismName: 'Human', proteinName: 'Cellular tumor antigen p53',
//   isReviewed: true }
```

<!-- GENERATED: searchUniProtEntries UniProtEntry UniProtSearchResult buildGeneNameQuery -->

```ts
function searchUniProtEntries(
  options: {
    recognizedIds?: string[]
    geneId?: string
    geneName?: string
    organismId?: number
  },
  opts?: FetchOptions,
): Promise<UniProtSearchResult>

interface UniProtEntry {
  accession: string
  id?: string
  geneName?: string
  organismName?: string
  proteinName?: string
  isReviewed: boolean
}

interface UniProtSearchResult {
  entries: UniProtEntry[]
  attemptedCount: number
  failedCount: number
}

function buildGeneNameQuery(
  geneName: string,
  organismId?: number,
  scope?: 'organism_id' | 'taxonomy_id',
): string
```

<!-- /GENERATED -->

- Every recognized id is searched as a UniProt cross-reference. `geneId` is
  added to them when it is one, after its version suffix is stripped.
- The gene-name search runs at the same time, but its answer counts only when no
  cross-reference found a reviewed entry. It asks `gene_exact`, which skips
  synonyms and paralogs, and is limited to reviewed entries.
- `organismId` is an NCBI taxon id. Without it the search covers every species.
  When the taxon itself finds nothing, the search widens to its descendants:
  Swiss-Prot files fission yeast (4896) under strain 284812.
- Reviewed entries sort first. When every attempt fails, the call throws the
  network error rather than returning an empty list; partial failures show in
  `failedCount`.

### Database ids

```ts
import {
  buildUniProtXrefQuery,
  getDbIdLabel,
  isRecognizedDatabaseId,
  stripTrailingVersion,
} from 'p2s_mapper'

isRecognizedDatabaseId('ENST00000269305') // true
isRecognizedDatabaseId('TP53') // false
getDbIdLabel('ENST00000269305') // 'ENST00000269305 (Ensembl transcript)'
buildUniProtXrefQuery('HGNC:11998') // 'xref:hgnc-11998'
buildUniProtXrefQuery('GeneID:7157') // 'xref:geneid-7157'
stripTrailingVersion('NM_000546.6') // 'NM_000546'
```

<!-- GENERATED: isRecognizedDatabaseId getDbIdLabel buildUniProtXrefQuery stripTrailingVersion matchDbIdPattern DbType -->

```ts
function isRecognizedDatabaseId(id: string): boolean

function getDbIdLabel(id: string): string

function buildUniProtXrefQuery(id: string): string | undefined

function stripTrailingVersion(s?: string): string | undefined

function matchDbIdPattern(
  id: string,
): { db: DbType; pattern: RegExp; label: string } | undefined

type DbType = 'ensembl' | 'refseq' | 'ccds' | 'hgnc' | 'geneid'
```

<!-- /GENERATED -->

Recognized: Ensembl gene, transcript and protein ids of any species; RefSeq
mRNA, ncRNA and protein (`NP_`, `XP_`, `YP_`, `AP_`, not `WP_`, which names a
sequence shared across species); CCDS; HGNC; and NCBI `GeneID:`.

### AlphaFold

```ts
import { fetchAlphaFoldModels, pickAlphaFoldModel } from 'p2s_mapper'

const models = await fetchAlphaFoldModels('P04637')
const model = pickAlphaFoldModel(models, {
  'NM_000546.6': { seq: 'MEEPQSDPSV…' },
})
model?.url // the model's mmCIF
model?.meanPlddt // mean confidence, 0-100
```

<!-- GENERATED: fetchAlphaFoldModels parseAlphaFoldModels pickAlphaFoldModel AlphaFoldModel -->

```ts
function fetchAlphaFoldModels(
  uniprotId: string,
  opts?: FetchOptions,
): Promise<AlphaFoldModel[]>

function parseAlphaFoldModels(json: unknown): AlphaFoldModel[]

function pickAlphaFoldModel(
  models: AlphaFoldModel[],
  isoformSequences: Record<string, { seq: string }> | undefined,
): AlphaFoldModel | undefined

interface AlphaFoldModel {
  /** UniProt accession, with an isoform suffix on an isoform model */
  accession: string
  /** AlphaFold DB's id for the model, e.g. AF-P04637-F1 */
  entity?: string
  url: string
  confidenceUrl?: string
  /** mean per-residue confidence (pLDDT), 0-100 */
  meanPlddt?: number
  sequence: string
}
```

<!-- /GENERATED -->

`fetchAlphaFoldModels` asks AlphaFold DB which models exist rather than deriving
a file name: a protein past AlphaFold's length cap has no F1 model at all
(dystrophin has fourteen isoform models), and the model version moves. An
accession AlphaFold never folded returns `[]`.

`pickAlphaFoldModel` prefers a model folded from exactly one of the
translations, canonical first, so the view maps it as an identity. Failing that,
it takes the canonical model, then the longest isoform model.

### Experimental structures (3D-Beacons)

```ts
import { fetchExperimentalStructures, getPdbStructureUrl } from 'p2s_mapper'

const structures = await fetchExperimentalStructures('P04637')
structures[0]
// { pdbId: '9r2q', method: 'ELECTRON MICROSCOPY', resolution: 3.2,
//   start: 1, end: 393, coverage: 1 }
const url = structures[0] && getPdbStructureUrl(structures[0].pdbId)
```

<!-- GENERATED: fetchExperimentalStructures parseExperimentalStructures beaconsSummaryUrl ExperimentalStructure -->

```ts
function fetchExperimentalStructures(
  uniprotId: string,
  opts?: FetchOptions,
): Promise<ExperimentalStructure[]>

function parseExperimentalStructures(json: unknown): ExperimentalStructure[]

function beaconsSummaryUrl(uniprotId: string): string

interface ExperimentalStructure {
  pdbId: string
  method: string
  /** Å; absent for NMR and some EM entries */
  resolution?: number
  /** 1-based inclusive UniProt residues the entry covers */
  start: number
  end: number
  /** fraction of the UniProt sequence the entry covers, 0..1 */
  coverage: number
}
```

<!-- /GENERATED -->

Every PDBe entry mapped to the accession, best coverage first and sharpest
resolution within a tie, in one CORS-enabled call. Predictions and SASBDB's
scattering fits are left out: a prediction comes from AlphaFold's own API, and a
scattering fit has no residue mapping. The call asks for the unfiltered summary
and retries once, because the `?provider=pdbe` form 404s intermittently. It is
best-effort: an unreachable API returns `[]`.

### PDBe

```ts
import {
  isPdbId,
  jsonfetch,
  parseBestStructures,
  parseEntryMolecules,
  pdbeBestStructuresUrl,
  pdbeEntryMoleculesUrl,
} from 'p2s_mapper'

const best = parseBestStructures(
  await jsonfetch(pdbeBestStructuresUrl('P04637')),
)
best[0]?.chains // ['K', 'L', 'M', 'N']: one row per entry, chains collapsed

parseEntryMolecules(await jsonfetch(pdbeEntryMoleculesUrl('1tup')))
// ['SSSVPSQKTYQGSYGFRLGF…']: protein entities only

isPdbId('1tup') // true
isPdbId('1tu') // false, so a half-typed id never reaches a fetch
```

<!-- GENERATED: pdbeBestStructuresUrl parseBestStructures PdbStructureEntry pdbeEntryMoleculesUrl parseEntryMolecules isPdbId -->

```ts
function pdbeBestStructuresUrl(uniprotId: string): string

function parseBestStructures(json: unknown): PdbStructureEntry[]

interface PdbStructureEntry {
  pdbId: string
  experimentalMethod: string
  /** Å; absent for NMR and some EM entries */
  resolution?: number
  /** 1-based inclusive UniProt positions the entry covers */
  unpStart: number
  unpEnd: number
  /** share of the UniProt sequence the entry covers, 0..1 */
  coverage: number
  chains: string[]
}

function pdbeEntryMoleculesUrl(pdbId: string): string

function parseEntryMolecules(json: unknown): string[]

function isPdbId(value: string): boolean
```

<!-- /GENERATED -->

These are URL builders and parsers, so the host does the fetching.
`parseEntryMolecules` returns an entry's protein sequences from a few kB of
JSON, enough to rank isoforms before downloading the whole structure.

## URLs and formats

### Structure URLs

```ts
import {
  getAlphaFoldStructureUrl,
  getPdbIdFromUrl,
  getPdbStructureUrl,
  resolveStructureUrl,
  structureDisplayLabel,
} from 'p2s_mapper'

getPdbStructureUrl('1tup') // 'https://files.rcsb.org/download/1tup.cif'
getAlphaFoldStructureUrl('P04637')
// 'https://alphafold.ebi.ac.uk/files/AF-P04637-F1-model_v6.cif'

resolveStructureUrl({ pdbId: '1tup' }) // the RCSB url above
resolveStructureUrl({ uniprotId: 'P04637', pdbId: '1tup' }) // undefined

getPdbIdFromUrl('https://files.rcsb.org/download/1TUP.cif') // '1tup'
getPdbIdFromUrl('https://example.com/1tup.cif') // undefined

structureDisplayLabel({ url: 'https://files.rcsb.org/download/1tup.cif' }) // '1TUP'
structureDisplayLabel({ uniprotId: 'P04637' }) // 'AlphaFold P04637'
```

<!-- GENERATED: getPdbStructureUrl getAlphaFoldStructureUrl resolveStructureUrl getPdbIdFromUrl structureDisplayLabel -->

```ts
function getPdbStructureUrl(pdbId: string): string

function getAlphaFoldStructureUrl(uniprotId: string, version?: string): string

function resolveStructureUrl(options: {
  url?: string
  data?: string
  uniprotId?: string
  pdbId?: string
}): string | undefined

function getPdbIdFromUrl(url: string): string | undefined

function structureDisplayLabel(options: {
  url?: string
  data?: string
  uniprotId?: string
}): string
```

<!-- /GENERATED -->

- `getAlphaFoldStructureUrl` guesses the canonical model's file name. Use it
  only when `fetchAlphaFoldModels` cannot be reached.
- `resolveStructureUrl` turns a `{ pdbId }` shorthand into a URL. An explicit
  `url` or inline `data` always wins. A `uniprotId` resolves to no URL, and
  outranks a `pdbId`, because which AlphaFold file to open is a question for
  `fetchAlphaFoldModels`.
- `getPdbIdFromUrl` recognizes only the PDB archive's own hosts, so a user's
  model that happens to be named `1abc.cif` does not pick up 1ABC's annotations.

### Foldseek hits

```ts
import {
  caCoordsToPdb,
  getConfidenceUrlFromTarget,
  getStructureUrlFromTarget,
  getUniprotIdFromAlphaFoldTarget,
  hasValidCaCoords,
} from 'p2s_mapper'

getUniprotIdFromAlphaFoldTarget('AF-P04637-2-F1-model_v6') // 'P04637-2'
getStructureUrlFromTarget('8f2h-assembly1.cif.gz_A', 'pdb100')
// 'https://files.rcsb.org/download/8f2h.cif'
getConfidenceUrlFromTarget('AF-P16442-F1-model_v6')
// 'https://alphafold.ebi.ac.uk/files/AF-P16442-F1-confidence_v6.json'

const hit = { tCa: '1.0,2.0,3.0,4.5,5.5,6.5', tSeq: 'MK' }
if (hasValidCaCoords(hit)) {
  caCoordsToPdb(hit.tCa, hit.tSeq)
  // ATOM      1  CA  MET A   1       1.000   2.000   3.000  1.00  0.00           C
  // ATOM      2  CA  LYS A   2       4.500   5.500   6.500  1.00  0.00           C
}
```

<!-- GENERATED: getUniprotIdFromAlphaFoldTarget getStructureUrlFromTarget getConfidenceUrlFromTarget caCoordsToPdb hasValidCaCoords -->

```ts
function getUniprotIdFromAlphaFoldTarget(target: string): string | undefined

function getStructureUrlFromTarget(
  target: string,
  db: string,
): string | undefined

function getConfidenceUrlFromTarget(target: string): string | undefined

function caCoordsToPdb(
  tCa: string,
  tSeq: string,
  chainId?: string,
  title?: string,
): string

function hasValidCaCoords<T extends { tCa?: string; tSeq?: string }>(
  hit: T,
): hit is T & { tCa: string; tSeq: string }
```

<!-- /GENERATED -->

`caCoordsToPdb` builds a Cα-only PDB file from a Foldseek hit's coordinates, for
a hit that has no downloadable structure.

### Link URLs

```ts
import {
  rcsbEntryUrl,
  uniprotEntryUrl,
  uniprotFastaUrl,
  uniprotGffUrl,
} from 'p2s_mapper'

uniprotGffUrl('P04637') // 'https://rest.uniprot.org/uniprotkb/P04637.gff'
uniprotFastaUrl('P04637') // 'https://rest.uniprot.org/uniprotkb/P04637.fasta'
uniprotEntryUrl('P04637') // 'https://www.uniprot.org/uniprotkb/P04637/entry'
rcsbEntryUrl('1tup') // 'https://www.rcsb.org/structure/1TUP'
```

<!-- GENERATED: uniprotGffUrl uniprotFastaUrl uniprotEntryUrl rcsbEntryUrl -->

```ts
function uniprotGffUrl(uniprotId: string): string

function uniprotFastaUrl(uniprotId: string): string

function uniprotEntryUrl(uniprotId: string): string

function rcsbEntryUrl(pdbId: string): string
```

<!-- /GENERATED -->

### Formats

```ts
import {
  isBinaryStructureUrl,
  structureFileExtension,
  structureFormatFromContent,
  structureFormatFromName,
} from 'p2s_mapper'

structureFormatFromContent('# comment\ndata_1TUP\n') // 'mmcif'
structureFormatFromContent('HEADER    DNA BINDING PROTEIN\nATOM') // 'pdb'
structureFormatFromName('pdb1tup.ent.gz') // 'pdb'
structureFormatFromName('model.cif') // 'mmcif', also the fallback
structureFileExtension('https://x.org/pdb1tup.ent.gz?v=2') // 'ent'
isBinaryStructureUrl('https://models.rcsb.org/1tup.bcif') // true
```

<!-- GENERATED: StructureFormat structureFormatFromContent structureFormatFromName structureFileExtension isBinaryStructureUrl -->

```ts
type StructureFormat = 'pdb' | 'mmcif'

function structureFormatFromContent(data: string): StructureFormat

function structureFormatFromName(nameOrUrl: string): StructureFormat

function structureFileExtension(nameOrUrl: string): string

function isBinaryStructureUrl(url: string): boolean
```

<!-- /GENERATED -->

Choose by content whenever there is content. PDB read as mmCIF throws, but mmCIF
read as PDB succeeds and yields thousands of misread atoms and zero polymer
entities, so a wrong guess shows nothing and reports nothing.
`structureFormatFromContent` looks only at the first 4 kB.

## Fetch helpers

```ts
import {
  HttpError,
  isDefinitiveFailure,
  searchUniProtEntries,
} from 'p2s_mapper'

const controller = new AbortController()
const loggedFetch: typeof fetch = (input, init) => {
  console.warn('fetch', input)
  return fetch(input, init)
}

try {
  await searchUniProtEntries(
    { geneName: 'TP53', organismId: 9606 },
    { fetch: loggedFetch, signal: controller.signal },
  )
} catch (e) {
  if (e instanceof HttpError && !isDefinitiveFailure(e)) {
    // a 5xx: worth asking again
  }
}
```

<!-- GENERATED: FetchOptions rawfetch myfetch jsonfetch HttpError httpError isDefinitiveFailure networkError abortError timeout -->

```ts
interface FetchOptions extends RequestInit {
  fetch?: typeof globalThis.fetch
}

function rawfetch(url: string, args?: FetchOptions): Promise<Response>

function myfetch(url: string, args?: FetchOptions): Promise<Response>

function jsonfetch<T = unknown>(url: string, args?: FetchOptions): Promise<T>

class HttpError extends Error {
  readonly status: number
  constructor(message: string, status: number)
}

function httpError(response: Response, url: string): Promise<HttpError>

function isDefinitiveFailure(e: unknown): boolean

function networkError(url: string, cause: unknown): unknown

function abortError(signal: AbortSignal): Error

function timeout(time: number, signal?: AbortSignal): Promise<void>
```

<!-- /GENERATED -->

- Every network function takes `FetchOptions` last: `RequestInit` plus the
  `fetch` to call, which defaults to `globalThis.fetch` at call time. Pass an
  instrumented fetch from the host, or a double from a test.
- Outside a browser, a request with no `User-Agent` of its own sends
  `p2s_mapper (+https://github.com/GMOD/p2s_mapper)`, because AlphaFold's API
  answers 403 to `node`, the one Node's fetch sends. A browser sends its own.
- `rawfetch` returns any response; `myfetch` throws an `HttpError` on a non-2xx
  one; `jsonfetch` also parses the body, typed as the caller names it.
- An `HttpError` carries the `status`, and its message carries the host and the
  first line of the body, not a whole HTML error page. `isDefinitiveFailure` is
  true for a 4xx, where asking again gets the same answer.
- `networkError` replaces the browser's bare `TypeError: Failed to fetch` with a
  message naming the host. `abortError` turns an `AbortSignal`'s reason into a
  real `Error`, and `timeout` is an abortable delay.
