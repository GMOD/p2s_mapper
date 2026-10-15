# API reference

This page lists every export, grouped by task, with its signature and an
example. For how the pieces fit together, see [pipeline.md](pipeline.md); for
the numbering rules, see [coordinates.md](coordinates.md).

Conventions:

- Positions are **0-based**. UniProt positions and author residue numbers are
  1-based.
- Ranges are `{ start, end }`. A range of positions is half-open; a range of
  residue numbers (UniProt, author, "residues 102-292") is inclusive.
- A `PairwiseAlignment` has **row 0 = transcript, row 1 = structure**.
- Every network function takes an optional `FetchOptions` last (see
  [Fetch helpers](#fetch-helpers)).

`pnpm docs:api` generates each signature block from the compiler, between its
`GENERATED` markers, and `pnpm test` fails when one is out of date.

- [Alignment](#alignment)
- [Coordinates](#coordinates)
- [Chain choice](#chain-choice)
- [UniProt mapping](#uniprot-mapping)
- [Structure sources](#structure-sources)
- [URLs and formats](#urls-and-formats)
- [Fetch helpers](#fetch-helpers)

## Alignment

### Aligning two sequences

```ts
import { alignSequences, scoredAlignment, smithWaterman } from 'p2s_mapper'

const pa = alignSequences('MKVLAW', 'MKILA', 'needleman_wunsch')
pa.alns[0].seq // 'MKVLAW'
pa.alns[1].seq // 'MKILA-'
pa.consensus // '||:|| '

scoredAlignment('MKVLA', 'MKILA', 'smith_waterman').score // 21

smithWaterman('HEAGAWGHEE', 'PAWHEAE').alignedSeq1 // '-HEAGAWGHE--E'
```

<!-- GENERATED: alignSequences runLocalAlignment scoredAlignment smithWaterman needlemanWunsch AlignmentResult selfScore alignmentTooLarge MAX_ALIGNMENT_CELLS -->

```ts
function alignSequences(
  transcript: string,
  structure: string,
  algorithm: AlignmentAlgorithm,
): PairwiseAlignment

/** @deprecated renamed to `alignSequences`, which runs either algorithm */
function runLocalAlignment(
  transcript: string,
  structure: string,
  algorithm: AlignmentAlgorithm,
): PairwiseAlignment

function scoredAlignment(
  transcript: string,
  structure: string,
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

- The Smith-Waterman and Needleman-Wunsch aligners score with BLOSUM62 and
  affine gaps: open -10, extend -0.5, the EMBOSS defaults.
- `alignSequences` puts the transcript in row 0 and the structure in row 1, in
  the order you pass them. `runLocalAlignment` is its old name, kept as a
  deprecated alias.
- Each row contains its whole sequence, with the residues outside
  Smith-Waterman's local alignment placed at the ends, opposite gaps, as the
  `smithWaterman` line above shows. Every coordinate map therefore works on a
  local alignment too.
- The consensus row marks identities with `|`, positive BLOSUM62 pairs with `:`
  and everything else with a space.
- The DP table is capped at `MAX_ALIGNMENT_CELLS` (about 40 MB and a second of
  work). Past it the aligners throw; check `alignmentTooLarge` first when there
  are several candidates and some may be huge.
- `selfScore` is the score of a sequence against itself without gaps, which is
  the score `alignTranscriptToEntity` gives an exact match.

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

Row 0 is the transcript and row 1 is the structure. The type cannot enforce the
order, and swapped rows invert every map without an error, so read the rows with
`transcriptAlignedSeq` and `structureAlignedSeq`.

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

Run both checks on an alignment from outside the package.
`pairwiseAlignmentProblem` rejects rows of different lengths.
`pairwiseAlignmentSequenceProblem` rejects rows that are not the transcript and
chain being mapped, such as an alignment made against another isoform, which
would shift every position after the first difference. Each returns a message to
show, or `undefined`.

### Unmapping residues

```ts
import {
  mappedStructureIdentity,
  alignSequences,
  unmapStructurePositions,
} from 'p2s_mapper'

const pa = alignSequences('MKVLAW', 'MKILA', 'needleman_wunsch')
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
  the transcript residue opposite it is identical, so a host can flag the
  mismatches.
- `unmapStructurePositions` moves the given structure positions out of their
  columns. Each row still contains its whole sequence, and those residues map to
  nothing. It returns the same object when there is nothing to move. Use it on
  the result of `fusionPartnerPositions`; `keepSharedStretches` calls it too.

### Two isoforms of one protein

```ts
import { sharedIsoformResidues } from 'p2s_mapper'

// the second isoform has a four-residue insert after residue 10
const shared = sharedIsoformResidues(
  'MKTAYIAKQRQISFVKSHFSRQ',
  'MKTAYIAKQRDEFGHISFVKSHFSRQ',
)
shared.get(9) // 9
shared.get(10) // undefined: Q is opposite the insert's D
shared.get(11) // 15
```

<!-- GENERATED: sharedIsoformResidues sharedResidueMap keepSharedStretches -->

```ts
function sharedIsoformResidues(from: string, to: string): Map<number, number>

function sharedResidueMap(a: string, b: string): Map<number, number>

function keepSharedStretches(pa: PairwiseAlignment): PairwiseAlignment
```

<!-- /GENERATED -->

`sharedResidueMap` maps a residue from one isoform to the other only inside a
run of identical residues. The run must be at least 10 long, or at least 3 long
with a gap or a sequence end on each side, which is how a short shared exon
aligns. A single substitution between two such runs maps too. A mutually
exclusive exon (PKM's exons 9 and 10) therefore maps nothing, although it aligns
column for column.

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
  /** columns with a residue in both rows, i.e. mapped positions */
  aligned: number
  identical: number
  transcriptLength: number
  structureLength: number
  /** identical over aligned; 0 when nothing aligned */
  identity: number
  /** identical over the shorter of the two sequences, which separates a
   * real match from a chance local alignment (see LOW_IDENTITY_OVER_SHORTER) */
  identityOverShorter: number
  /** aligned over the structure's length */
  structureCoverage: number
  /** first and last transcript residue the alignment covers, 1-based
   * inclusive; 0 when nothing aligned. A structure is usually a fragment, so
   * these show which part of the protein it contains. */
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

Local alignment picks the best-scoring stretch of two sequences, so identity
over the aligned columns is high even for a chance match. `isLowSimilarity` uses
`identityOverShorter` instead, with a floor that depends on the number of
identical residues:

- At 20 identical residues or more, the floor is 0.3.
- Under 20, it rises to 0.8, since a short real match (a bound peptide) is
  identical or one off.
- Under 5, every match is low similarity.

The host decides what to do with a low-similarity match. `describeCoveredRange`
is `undefined` when the structure covers the whole translation.
[faq.md](faq.md#what-if-the-structure-is-not-my-protein) has the measurements
behind the thresholds.

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
   * The lookup tables as plain numbers, for code that iterates a whole map,
   * such as drawing a per-residue track or selecting every aligned residue.
   * Use the typed methods above to convert one position.
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
- `maps` holds the raw tables as plain numbers, for code that iterates a whole
  map, such as highlighting every aligned residue.
- `transcriptRangeToStructureRange` takes 1-based inclusive transcript residues
  and returns a 0-based half-open structure range. It skips residues the
  structure lacks, so for a feature running past a fragment's end, the range
  ends at the last modelled residue. It returns `undefined` when none of the
  range aligns.

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

A branded position is a plain number at runtime. Wrap a raw number with
`structurePos` or `transcriptPos` as soon as you read it, for example from a
Mol\* click or hover, and the compiler then rejects it where the other kind of
position belongs.

### Raw maps

```ts
import {
  invertMap,
  alignSequences,
  structurePositionToAlignmentMap,
  structureSeqVsTranscriptSeqMap,
} from 'p2s_mapper'

const pa = alignSequences('MKVLAW', 'MKILA', 'needleman_wunsch')
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

`makeCoordinateMapper` builds its tables with these functions; use the mapper
instead where you can. `structureSeqVsTranscriptSeqMap` throws on an alignment
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

`codonGenomeSpan` returns the 0-based half-open genome span that covers every
base of a codon, for navigating to or highlighting a residue on the genome. It
reads the codon's bases with g2p_mapper's `getCodonRanges`.

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

Use `stripStopCodon` on anything you map. An interior `*` is a real codon (a
mis-annotated CDS, a selenocysteine), and deleting it would shift every later
residue out of step with g2p_mapper's codon numbering. `stripAllStopCodons` is
for a sequence sent to an outside search such as Foldseek, where `*` is not a
valid character and no position depends on the result.

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
  /** index of the chosen entity in the candidate array */
  index: number
}

interface ScoredAlignment {
  /** alignment of the transcript against the entity, with stop codons
   * stripped from both */
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
   sequences, plus a 5-residue pseudocount (`explainedFraction`). It skips DNA
   and RNA chains; pass them as `{ seq, nucleicAcid: true }`, because their
   letters are amino-acid letters too.

`chooseMappedEntity` returns the best match even when it is poor, so check it
with [`isLowSimilarity`](#quality). The result is `undefined` only when there is
nothing to map: an empty transcript, or no protein chain. The function strips
stop codons from both sides.
[pipeline.md](pipeline.md#why-the-score-divides-by-the-shorter-sequence)
explains why the score divides by the shorter sequence.

`alignTranscriptToEntity` scores one pair; use it when the user picks the chain.
It returns `undefined` for a pair over the size cap.

`interactionMatchesMappedEntity` returns whether a hover or click on an entity
should move the genome view. Only the mapped entity should, because another
chain's positions would go through the wrong alignment. With no mapped entity,
every chain stays interactive.

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
  /** mmCIF entity id */
  entityId: string
  /** one letter per residue, observed or not */
  seq: string
  /** molstar `label_seq_id` per position of `seq` */
  seqIds: number[]
  /** author chain ids of this entity, e.g. ['A', 'B'] for a homodimer, as
   * the PDB entry page lists them */
  chains: string[]
  /** DNA, RNA or a hybrid, by molstar's entity subtype. A, C, G, T and U
   * are amino-acid letters too, so chooseMappedEntity skips these. */
  nucleicAcid?: boolean
  /** `auth_seq_id` per position: the depositors' numbering, which papers cite
   * (1TUP's position 154 is R248) and Mol*'s hover shows. For display only;
   * use `seqIds` to select residues in Mol*. Absent when the model has no
   * atomic hierarchy. See `residueNumber`. */
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

- `StructureModel` lists the fields of a Mol\* model these functions read. Pass
  the Mol\* object itself; the package never imports Mol\*.
- You can pass an `Entity` to `chooseMappedEntity` directly, since it has `seq`
  and `nucleicAcid`.
- `extractStructureSequences` returns just the protein chains' sequences.
- `extractEntities` reads the sequence from Mol\*'s `sequence.code`. Mol\*'s
  `sequence.label` lists some residues as their three-letter component id (MSE,
  TPO, ACE), so the label is longer than `seqIds`, and every later position
  would select the wrong residue.
- `oneLetterSequence` replaces each `X` in `sequence.code` with the residue from
  the mmCIF canonical sequence: `oneLetterSequence(['M', 'X', 'K'], 'MMK')` is
  `'MMK'`.
- `fillAuthSeqIds` numbers unobserved residues by the offset of the nearest
  observed one, so the numbering continues through a disordered loop as the
  paper's does.

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

Get Mol\*'s `label_seq_id` from these functions, which read `Entity.seqIds`.
`label_seq_id` is position + 1 only in a file with `entity_poly_seq` or SEQRES.
A PDB file without SEQRES uses author numbering, with gaps at unobserved
residues. [coordinates.md](coordinates.md) has the full rules. `residueNumber`
and `residueRangeToPositions` are for display and for user input such as "R248";
don't pass their numbers to a coordinate map.

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

AlphaFold stores pLDDT in the B-factor column, so `extractPerResidueConfidence`
reads the B-factor of each residue's first atom. It keys the values by
`label_seq_id`, because the atomic hierarchy holds only observed residues. For
an experimental entry the column holds real B-factors, not confidence, so check
the experimental method before drawing it; `looksLikePlddt` only rejects a
constant or out-of-range column.

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
  /** that alignment's score, which ranks the non-matching isoforms */
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

`classifyIsoforms` puts first an isoform that translates to exactly the
structure's sequence, and ranks the rest by alignment score, then identical
residues, then length. Score comes first because an isoform with an exon the
structure lacks still aligns every structure residue, across a gap (1MH1 against
Rac1 and Rac1b).

`pickStructureSequence` chooses the chain to rank against. It picks a chain some
isoform translates to exactly, else the chain `chooseMappedEntity` maps the
longest isoform to. On 1H26 the first chain is CDK2, while the p53 peptide is
the third.

## UniProt mapping

SIFTS aligns each polymer entity of every PDB entry to UniProt, and RCSB
publishes the result. The package maps residues with its own alignment, and uses
the entry's UniProt alignment to place UniProt annotations and to find fusion
partners.

### Fetching

```ts
import { fetchPdbEntry, fetchUniProtStructureMappings } from 'p2s_mapper'

const entry = await fetchPdbEntry('1tup')
entry.proteinSequences // ['SSSVPSQKTYQ…']: protein entities only
entry.mappings
// [{
//   accession: 'P04637',
//   name: 'P53_HUMAN',
//   segments: [
//     { entityId: '3', chainId: 'A', unpStart: 94, unpEnd: 312,
//       structStart: 0, structEnd: 218 },
//     ...chains B and C
//   ],
// }]

await fetchUniProtStructureMappings('1tup') // the mappings alone
```

<!-- GENERATED: fetchPdbEntry fetchUniProtStructureMappings parsePdbEntry pdbEntryQuery PdbEntry UniProtStructureMapping UniProtStructureSegment graphqlFetch RCSB_DATA_GRAPHQL_URL labelChainsQuery parseLabelChains fetchLabelChains -->

```ts
function fetchPdbEntry(pdbId: string, opts?: FetchOptions): Promise<PdbEntry>

function fetchUniProtStructureMappings(
  pdbId: string,
  opts?: FetchOptions,
): Promise<UniProtStructureMapping[]>

function parsePdbEntry(data: unknown): PdbEntry | undefined

function pdbEntryQuery(pdbId: string): string

interface PdbEntry {
  /** every UniProt accession the entry's entities align to */
  mappings: UniProtStructureMapping[]
  /** one sequence per protein entity, in entity order; nucleic acids left
   * out, since A, C, G, T and U are amino-acid letters too */
  proteinSequences: string[]
}

interface UniProtStructureMapping {
  accession: string
  /** UniProt entry name, e.g. "P53_HUMAN" */
  name?: string
  segments: UniProtStructureSegment[]
}

interface UniProtStructureSegment {
  entityId: string
  /** author chain id, when the source names it */
  chainId?: string
  unpStart: number
  unpEnd: number
  structStart: number
  structEnd: number
}

function graphqlFetch(
  url: string,
  query: string,
  variables: Record<string, unknown> | undefined,
  opts?: FetchOptions,
): Promise<unknown>

const RCSB_DATA_GRAPHQL_URL: 'https://data.rcsb.org/graphql'

function labelChainsQuery(pdbId: string): string

function parseLabelChains(data: unknown): Map<string, string>

function fetchLabelChains(
  pdbId: string,
  opts?: FetchOptions,
): Promise<Map<string, string>>
```

<!-- /GENERATED -->

`fetchPdbEntry` reads the alignment and the entry's protein sequences in one
GraphQL call to RCSB's data API. The answer is a few kB, so a host can label an
isoform list without downloading the structure file, which for a ribosome is
large.

`fetchPdbEntry` retries twice within a 20-second deadline. It does not retry an
id RCSB has no entry for, which throws a 404 `HttpError`, or a GraphQL error,
which throws as a 400, because asking again gets the same answer. For an entry
with no UniProt alignment, such as DNA alone, it returns empty `mappings`.
`structStart` and `structEnd` are 0-based inclusive structure positions;
`unpStart` and `unpEnd` are 1-based UniProt positions.

We compared RCSB with PDBe's SIFTS API on 23 entries on 2026-10-11, including
1TUP, 2RH1, 4HHB and the 7K00 ribosome, and every mapped residue agreed. RCSB
answered in 3 s and PDBe in 24 s, and PDBe failed on one entry.

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
fits `SegmentEntity`. In a heteromer each chain has a different accession. When
several accessions cover one entity (a chimera), `chooseUniProtMappingForEntity`
picks the one covering the most residues. For an AlphaFold model, whose sequence
is the UniProt sequence, use `identityUniProtPositionMap` instead of fetching
the entry.

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

Local alignment continues across a fusion boundary, so on 2RH1 it maps 33
receptor residues onto T4 lysozyme. `fusionPartnerPositions` returns the mapped
positions that the entry's UniProt alignment assigns to another protein. It
takes the transcript's accession to be the one whose positions are most often
identical to the transcript. If that accession is under half identity, it treats
the transcript as neither protein and returns no positions. Residues with no
accession, such as tags, stay mapped.

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

<!-- GENERATED: searchUniProtEntries searchUniProtByEntryName UniProtEntry UniProtSearchResult buildGeneNameQuery -->

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

function searchUniProtByEntryName(
  entryName: string,
  opts?: FetchOptions,
): Promise<UniProtEntry[]>

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

- `searchUniProtByEntryName` takes an entry name such as `HBA_HUMAN`, which is
  not a cross-reference to another database, so `searchUniProtEntries` does not
  search it. It asks UniProt's `id` field, drops a retired entry that has no
  accession, and lists reviewed entries first.
- `searchUniProtEntries` searches each recognized id as a UniProt
  cross-reference. It searches `geneId` too when it is a recognized id, without
  its version suffix.
- The gene-name search runs at the same time, but its results count only when no
  cross-reference search found a reviewed entry. It searches `gene_exact`, which
  skips synonyms and paralogs, and only reviewed entries.
- `organismId` is an NCBI taxon id, and without it the search covers every
  species. When the taxon has no match, the search widens to its descendants,
  because Swiss-Prot files fission yeast (4896) under strain 284812.
- Reviewed entries sort first. When every search fails, the call throws the
  network error rather than returning an empty list. `failedCount` counts the
  searches that failed.

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

`isRecognizedDatabaseId` accepts Ensembl gene, transcript and protein ids of any
species; RefSeq mRNA, ncRNA and protein (`NP_`, `XP_`, `YP_`, `AP_`, not `WP_`,
which names a sequence shared across species); CCDS; HGNC; and NCBI `GeneID:`.

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

`fetchAlphaFoldModels` asks AlphaFold DB which models exist. A file name derived
from the accession can be wrong, because a protein past AlphaFold's length cap
has no F1 model at all (dystrophin has fourteen isoform models), and the model
version changes. For an accession AlphaFold never folded, it returns `[]`.

`pickAlphaFoldModel` prefers a model folded from exactly one of the
translations, canonical first, so every residue maps to itself. Failing that, it
takes the canonical model, then the longest isoform model.

### Experimental structures (RCSB)

```ts
import { fetchExperimentalStructures, getPdbStructureUrl } from 'p2s_mapper'

const structures = await fetchExperimentalStructures('P04637')
structures[0]
// { pdbId: '8r1f', method: 'EM', resolution: 3.1,
//   start: 1, end: 393, coverage: 1, chains: ['C'] }
const url = structures[0] && getPdbStructureUrl(structures[0].pdbId)
```

<!-- GENERATED: fetchExperimentalStructures ExperimentalStructure parseEntityAlignments EntityAlignment parseEntityDetails EntityDetails experimentalStructures entityAlignmentsQuery ENTITY_DETAILS_QUERY RCSB_SEQUENCE_COORDINATES_URL -->

```ts
function fetchExperimentalStructures(
  uniprotId: string,
  opts?: FetchOptions,
): Promise<ExperimentalStructure[]>

interface ExperimentalStructure {
  pdbId: string
  /** RCSB's name for it: 'X-ray', 'EM', 'NMR', ... */
  method: string
  /** Å; absent for NMR and some EM entries */
  resolution?: number
  /** 1-based inclusive UniProt residues the entry covers */
  start: number
  end: number
  /** fraction of the UniProt sequence the entry covers, 0..1 */
  coverage: number
  /** author chain ids of the protein */
  chains: string[]
}

function parseEntityAlignments(data: unknown): EntityAlignment[]

interface EntityAlignment {
  /** RCSB's id, "1TUP_3" */
  entityId: string
  pdbId: string
  start: number
  end: number
  coverage: number
}

function parseEntityDetails(data: unknown): Map<string, EntityDetails>

interface EntityDetails {
  method: string
  resolution?: number
  chains: string[]
}

function experimentalStructures(
  alignments: EntityAlignment[],
  details: ReadonlyMap<string, EntityDetails>,
): ExperimentalStructure[]

function entityAlignmentsQuery(uniprotId: string): string

const ENTITY_DETAILS_QUERY: 'query($ids: [String!]!) { polymer_entities(entity_ids: $ids) {\n  rcsb_id\n  rcsb_polymer_entity_container_identifiers { auth_asym_ids }\n  entry { rcsb_entry_info { experimental_method resolution_combined } }\n} }'

const RCSB_SEQUENCE_COORDINATES_URL: 'https://sequence-coordinates.rcsb.org/graphql'
```

<!-- /GENERATED -->

`fetchExperimentalStructures` lists every PDB entry RCSB aligns to the
accession, best coverage first and best resolution within a tie, with the chains
of the protein. Of its two CORS-enabled calls, the sequence-coordinates API
lists the aligned entities and the UniProt range each covers, and the data API
returns each entry's method, resolution and chains, in batches of a thousand
entities. It skips RCSB's computed models (`AF_…`); use `fetchAlphaFoldModels`
for predictions. It returns `[]` for an accession with no entry or one RCSB does
not know, and looks up an isoform accession (P04637-2) under its canonical one.

We timed the alternatives for TP53 on 2026-10-11. RCSB's two calls took 1.3 s,
3D-Beacons took 3.7 s, and PDBe's best_structures took 14 s and timed out on
HBB. For BRCA1, RCSB and PDBe each listed 33 structures and 3D-Beacons listed
none.

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
  outranks a `pdbId`, because `fetchAlphaFoldModels` decides which AlphaFold
  file to open.
- `getPdbIdFromUrl` recognizes only the PDB archive's own hosts, so the package
  never gives a user's model that happens to be named `1abc.cif` the annotations
  of entry 1ABC.

### Searching Foldseek

```ts
import {
  foldseekHitPairs,
  foldseekQuery,
  predict3Di,
  searchFoldseek,
  submitFoldseekSearch,
  waitForFoldseekResults,
} from 'p2s_mapper'

// in one call
const query = foldseekQuery('MV-LSPADKTNVKAAWGKVGAHAGEYGAEALER')
const hits = await searchFoldseek(query.sequence, {
  databases: ['pdb100', 'afdb-swissprot'],
  onStatus: status => console.log(status),
})
for (const hit of hits.slice(0, 3)) {
  // [residue of the input, position in the target]
  foldseekHitPairs(hit, query)
}

// or a step at a time, to show the 3Di string before spending a search
const { aaSequence, di3Sequence } = await predict3Di(query.sequence)
const ticket = await submitFoldseekSearch({ aaSequence, di3Sequence })
const result = await waitForFoldseekResults(ticket.id)
```

<!-- GENERATED: searchFoldseek predict3Di submitFoldseekSearch waitForFoldseekResults foldseekQuery foldseekHitPairs foldseekHits parseFoldseekResponse parseFoldseekResult cleanFoldseekSequence foldseekLengthProblem FoldseekAlignment FoldseekHit FoldseekResult FoldseekDatabaseResult FoldseekTicket FoldseekQuery FoldseekSearchOptions FoldseekWaitOptions FoldseekDatabaseId FOLDSEEK_MAX_RESIDUES FOLDSEEK_DATABASES DEFAULT_FOLDSEEK_DATABASES -->

```ts
function searchFoldseek(
  sequence: string,
  options?: FoldseekSearchOptions,
): Promise<FoldseekHit[]>

function predict3Di(
  text: string,
  opts?: FetchOptions,
): Promise<{ aaSequence: string; di3Sequence: string }>

function submitFoldseekSearch(
  options: {
    aaSequence: string
    di3Sequence: string
    databases?: readonly string[]
  },
  opts?: FetchOptions,
): Promise<FoldseekTicket>

function waitForFoldseekResults(
  ticketId: string,
  options?: FoldseekWaitOptions,
): Promise<FoldseekResult>

function foldseekQuery(sequence: string): FoldseekQuery

function foldseekHitPairs(
  hit: FoldseekAlignment,
  query: FoldseekQuery,
): [number, number][] | undefined

function foldseekHits(result: FoldseekResult): FoldseekHit[]

function parseFoldseekResponse(body: unknown): FoldseekResult

function parseFoldseekResult(body: unknown): FoldseekHit[]

function cleanFoldseekSequence(text: string): string

function foldseekLengthProblem(text: string): string | undefined

interface FoldseekAlignment {
  /** the target's id followed by its description */
  target: string
  /** percent identity over the alignment */
  seqId?: number
  alnLength?: number
  mismatches?: number
  gapsopened?: number
  /** 1-based positions in the query sent and in the target's sequence */
  qStartPos?: number
  qEndPos?: number
  qLen?: number
  dbStartPos?: number
  dbEndPos?: number
  dbLen?: number
  /** the aligned query and target, `-` for a gap */
  qAln?: string
  dbAln?: string
  prob?: number
  eval?: number
  score?: number
  /** the target's CA coordinates as `x,y,z,x,y,z,…`, and its sequence */
  tCa?: string
  tSeq?: string
  taxId?: number
  taxName?: string
  query?: string
}

interface FoldseekHit extends FoldseekAlignment {
  db: string
}

interface FoldseekResult {
  query: {
    header: string
    sequence: string
  }
  results: FoldseekDatabaseResult[]
}

interface FoldseekDatabaseResult {
  db: string
  /** one list of alignments per query; undefined when the database has none */
  alignments?: FoldseekAlignment[][]
}

interface FoldseekTicket {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'ERROR'
}

interface FoldseekQuery {
  /** the twenty standard amino acids of the input, in order */
  sequence: string
  /** the 1-based residue of the input at each position of `sequence` */
  residueOf: number[]
}

interface FoldseekSearchOptions extends FoldseekWaitOptions {
  /** database ids to search; PDB and AlphaFold DB Swiss-Prot when unset */
  databases?: readonly string[]
}

interface FoldseekWaitOptions extends FetchOptions {
  /** told what the search is doing, for a progress line */
  onStatus?: (status: string) => void
  /** give up after this long, 180 s when unset */
  timeoutMs?: number
  /** wait this long between polls, 1 s when unset */
  pollMs?: number
}

type FoldseekDatabaseId = (typeof FOLDSEEK_DATABASES)[number]['id']

const FOLDSEEK_MAX_RESIDUES: 1200

const FOLDSEEK_DATABASES: readonly [
  { readonly id: 'pdb100'; readonly label: 'PDB (100% redundancy)' },
  {
    readonly id: 'afdb-swissprot'
    readonly label: 'AlphaFold DB (Swiss-Prot)'
  },
  { readonly id: 'afdb50'; readonly label: 'AlphaFold DB (50% redundancy)' },
  { readonly id: 'afdb-proteome'; readonly label: 'AlphaFold DB (Proteomes)' },
  { readonly id: 'cath50'; readonly label: 'CATH (50% redundancy)' },
  { readonly id: 'mgnify_esm30'; readonly label: 'MGnify ESM30' },
  { readonly id: 'bfmd'; readonly label: 'BFMD' },
  { readonly id: 'gmgcl_id'; readonly label: 'GMGCL' },
]

const DEFAULT_FOLDSEEK_DATABASES: FoldseekDatabaseId[]
```

<!-- /GENERATED -->

- Each step sends to `3di.foldseek.com` or `search.foldseek.com` and waits for
  their queue, about 8 s for a protein of 140 residues, so offer a search as an
  explicit action.
- `predict3Di` accepts FASTA, cleans it, and throws before any request on a
  sequence over 1,200 residues. The limit counts the cleaned residues.
- `submitFoldseekSearch` reports a refusal. The server answers a rate limit or
  maintenance as a 200 with no ticket id, which would otherwise be polled.
- `waitForFoldseekResults` throws on a failed search, on a ticket whose status
  is not pending, running or complete, and when the time budget runs out.
  `signal` cancels it.
- `parseFoldseekResponse` keeps every field the server sent, one list of
  alignments per query and per database. `parseFoldseekResult` and
  `searchFoldseek` list the first query's alignments of all databases as hits
  that name their database.
- `foldseekQuery` keeps the twenty standard amino acids, since the predictor
  cannot read X, U or B. `residueOf` maps each kept position back to the input
  residue, and `foldseekHitPairs` uses it, so a hit's pairs are in the input's
  own numbering.
- A target position is a `label_seq_id` only where the structure drawn is built
  from the same sequence. An AlphaFold F1 model is the UniProt sequence. A PDB
  chain's database sequence holds only residues with coordinates, so draw that
  hit from its `tCa` with `caCoordsToPdb`, which numbers the same way.
- `foldseekHitPairs` returns `undefined` for a hit with no alignment, or one
  that disagrees with its own start and end, which no mapping should be built
  from.

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
  isPdbId,
  rcsbEntryUrl,
  uniprotEntryUrl,
  uniprotFastaUrl,
  uniprotGffUrl,
} from 'p2s_mapper'

uniprotGffUrl('P04637') // 'https://rest.uniprot.org/uniprotkb/P04637.gff'
uniprotFastaUrl('P04637') // 'https://rest.uniprot.org/uniprotkb/P04637.fasta'
uniprotEntryUrl('P04637') // 'https://www.uniprot.org/uniprotkb/P04637/entry'
rcsbEntryUrl('1tup') // 'https://www.rcsb.org/structure/1TUP'
isPdbId('1tup') // true
isPdbId('1tu') // false, so a half-typed id never reaches a fetch
```

<!-- GENERATED: uniprotGffUrl uniprotFastaUrl uniprotEntryUrl rcsbEntryUrl isPdbId -->

```ts
function uniprotGffUrl(uniprotId: string): string

function uniprotFastaUrl(uniprotId: string): string

function uniprotEntryUrl(uniprotId: string): string

function rcsbEntryUrl(pdbId: string): string

function isPdbId(value: string): boolean
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

Use `structureFormatFromContent` whenever you have the file's text. PDB read as
mmCIF throws, but mmCIF read as PDB succeeds and yields thousands of misread
atoms and zero polymer entities, so a wrong guess shows an empty structure and
raises no error. `structureFormatFromContent` looks only at the first 4 kB.

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
- Outside a browser, a request with no `User-Agent` header sends
  `p2s_mapper (+https://github.com/GMOD/p2s_mapper)`, because AlphaFold's API
  answers 403 to `node`, which Node's fetch sends by default. In a browser, the
  browser sets the header.
- `rawfetch` returns any response; `myfetch` throws an `HttpError` on a non-2xx
  one; `jsonfetch` also parses the body and returns it as the type the caller
  passes.
- An `HttpError` has the `status`, and its message names the host and quotes the
  first line of the body. `isDefinitiveFailure` is true for a 4xx, where asking
  again gets the same answer.
- `networkError` replaces the browser's bare `TypeError: Failed to fetch` with a
  message naming the host. `abortError` turns an `AbortSignal`'s reason into a
  real `Error`, and `timeout` is an abortable delay.
