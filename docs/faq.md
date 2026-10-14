# FAQ: can I trust the mapping?

Mapping a genome position to a 3D structure takes several steps, and each can go
wrong. This page lists what the package checks at each step, what it refuses to
do, and what it leaves to you. The numbers come from measurements recorded in
the source comments and tests.

- [How do I know a residue is the right one?](#how-do-i-know-a-residue-is-the-right-one)
- [What if the structure is not my protein?](#what-if-the-structure-is-not-my-protein)
- [The structure has several chains. Which one maps?](#the-structure-has-several-chains-which-one-maps)
- [What if the structure differs from my transcript?](#what-if-the-structure-differs-from-my-transcript)
- [Why do residue numbers disagree with the paper?](#why-do-residue-numbers-disagree-with-the-paper)
- [What about fusion proteins and tags?](#what-about-fusion-proteins-and-tags)
- [What if I pass an alignment from elsewhere?](#what-if-i-pass-an-alignment-from-elsewhere)
- [What about very large proteins?](#what-about-very-large-proteins)
- [What does the package not guard against?](#what-does-the-package-not-guard-against)

## How do I know a residue is the right one?

The mapping has three steps, and each has one check.

| Step                     | Done by                                                        | Check                                               |
| ------------------------ | -------------------------------------------------------------- | --------------------------------------------------- |
| genome → transcript pos  | [g2p_mapper](https://github.com/GMOD/g2p_mapper)               | walks the CDS in transcription order, either strand |
| transcript → structure   | `alignSequences` and `makeCoordinateMapper`                    | `alignmentQuality`, `isLowSimilarity`               |
| structure → Mol\* / user | `toLabelSeqIds`, `Entity.authSeqIds`, `makeUniProtPositionMap` | one function per numbering, separate position types |

Two more checks apply across the steps:

- **The compiler rejects mixed-up positions.** `structurePos`, `transcriptPos`
  and `alignmentCol` are separate types, so passing one where another belongs is
  a compile error. See [coordinates.md](coordinates.md).
- **Each mapped residue is marked identical or not.** `mappedStructureIdentity`
  returns, for every mapped structure position, whether the transcript residue
  there is identical. A host can dim or flag the mismatches.

## What if the structure is not my protein?

Local alignment always finds _some_ best stretch, even between unrelated
sequences, so identity over the aligned columns is high even for a chance match.
The package measures identical residues over the **shorter** sequence instead.

On chance alignments, measured on 2026-09-11, identity over the shorter sequence
was 0.03, 0.20 and 0.24. Real structures of the transcript's protein score 0.9
or better, and an ortholog scores about 0.6. `isLowSimilarity` sets the floor at
0.3.

Short alignments need a higher score:

- Under 20 identical residues, the floor rises to 0.8. A 10-residue decoy with 3
  identities scores exactly the ordinary floor; a real bound peptide is
  identical or one residue off (1YCR's 15 p53 residues, 4ZZJ's 7).
- Under 5 identical residues, every match is low similarity.

`describeAlignmentQuality` and `describeTranscriptCoverage` turn the numbers
into a line such as "87% identity over 219 of 393 structure residues", so the
user sees which part of the protein the structure covers.

## The structure has several chains. Which one maps?

`chooseMappedEntity` aligns the transcript against every distinct polymer entity
and picks the best-scoring one. Three rules keep it from picking the large
partner of a complex:

- An **exact sequence match wins outright.**
- The score is identical residues over the **shorter** sequence, with a
  5-residue pseudocount so a two-residue fragment cannot score 1.0.
- **DNA and RNA entities are never candidates.**

On 1H26, the 11-residue p53 peptide scores 0.69 against CDK2's 0.19. Across a
ribosome's 55 chains, no decoy scores above 0.29.

`chooseMappedEntity` returns `undefined` when no chain can be mapped, and does
not fall back to entity 0. A fallback to entity 0 would mis-map every
heteromeric, protein-DNA and processed-peptide structure and raise no error.

A hover or click event has the `label_seq_id` of whichever chain is under the
pointer. `interactionMatchesMappedEntity` lets only the mapped entity move the
genome view, because another chain's positions would go through the wrong
alignment.

## What if the structure differs from my transcript?

A structure often differs from the transcript by substitutions, tags, deletions
and loops the crystal does not resolve.

- **Substitutions** map position to position and show as mismatches in
  `mappedStructureIdentity`.
- **Insertions and deletions** become gaps. The residues opposite a gap map to
  nothing rather than to a neighbour.
- **Unobserved loops** leave gaps in the structure's residue ids. The package
  converts to Mol\* ids through `Entity.seqIds`, which lists the real ids, so a
  gap does not shift the residues after it.
- **Modified residues** (MSE, TPO, ACE) come from `sequence.code`, which
  `extractEntities` reads. `sequence.label` lists them as three-letter component
  ids, which would shift every later position.

## Why do residue numbers disagree with the paper?

Papers cite the depositors' `auth_seq_id`, and Mol\* selects residues by
`label_seq_id`. The package keeps both and never converts between them by adding
an offset, because the offset varies: in 1TUP, position 154 is residue 248, and
haemoglobin's author residue 1 is UniProt residue 2. `Entity.authSeqIds` is
display-only. See [coordinates.md](coordinates.md).

For UniProt numbering, `makeUniProtPositionMap` uses the entry's own UniProt
alignment, read from RCSB, instead of assuming an offset.

## What about fusion proteins and tags?

Local alignment is most likely to go wrong on a fusion protein.

- With the score taken over the shorter sequence, a 60-residue target fused to a
  370-residue carrier still scores near 1.0. Divided by the entity's length
  alone, it would score 0.14, and a random 10-residue decoy would beat it a
  third of the time.
- Local alignment can still continue across the boundary onto the fusion
  partner: in 2RH1 it maps 33 receptor residues onto T4 lysozyme.
  `fusionPartnerPositions` finds the residues the entry's UniProt alignment
  assigns to another protein, and `unmapStructurePositions` removes them from
  the alignment.

## What if I pass an alignment from elsewhere?

`pairwiseAlignmentProblem` rejects rows that are empty or of different lengths.
`pairwiseAlignmentSequenceProblem` checks that each row, with gaps removed, is
the sequence you are mapping.

Without `pairwiseAlignmentSequenceProblem`, an alignment made against another
isoform or chain would shift every position after the first difference, with no
error. Each check returns a message to show instead of letting the mapping go
ahead.

## What about very large proteins?

Alignment costs time and memory proportional to the product of the two lengths.
`alignmentTooLarge` skips pairs over 40 million cells, and
`alignTranscriptToEntity` returns `undefined` for them, so a titin-sized
transcript cannot lock up or crash the tab.

## What does the package not guard against?

- **Translation exceptions.** g2p_mapper assumes standard three-base codons, and
  does not model selenocysteine recoding, frameshifts or other departures from
  the standard codon table.
- **The wrong isoform.** The alignment maps whatever transcript you give it.
  `classifyIsoforms` and `selectBestTranscript` rank isoforms against a chain,
  but the caller decides which transcript is the one on screen.
- **Homology models.** AlphaFold coordinates are predictions, so the mapping can
  place a residue correctly in a model that is wrong there.
  `extractPerResidueConfidence` reads AlphaFold's per-residue confidence
  (pLDDT), which estimates how accurate the model is at each residue.
- **A low-similarity result you ignore.** `isLowSimilarity` returns a verdict,
  and the host decides whether to show the mapping. Show the quality line next
  to it.

If you find a mapping that is wrong, the fixtures in `test/` show how to turn it
into a regression test.
