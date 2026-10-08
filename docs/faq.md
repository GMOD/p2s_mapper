# FAQ: can I trust the mapping?

A mapping from genome to 3D structure crosses several steps, and each can go
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

The mapping has three hops, and each hop has one job and one check.

| Hop                      | Done by                                                        | Check                                               |
| ------------------------ | -------------------------------------------------------------- | --------------------------------------------------- |
| genome → transcript pos  | [g2p_mapper](https://github.com/GMOD/g2p_mapper)               | walks the CDS in transcription order, either strand |
| transcript → structure   | `runLocalAlignment` and `makeCoordinateMapper`                 | `alignmentQuality`, `isLowSimilarity`               |
| structure → Mol\* / user | `toLabelSeqIds`, `Entity.authSeqIds`, `makeUniProtPositionMap` | one route per numbering, branded types              |

Two further properties hold the hops together:

- **Types stop mixed-up numbering.** `structurePos`, `transcriptPos` and
  `alignmentCol` are separate branded types, so the compiler rejects passing one
  where another belongs. See [coordinates.md](coordinates.md).
- **A mapped residue says whether it matched.** `mappedStructureIdentity`
  returns, for every mapped structure position, whether the transcript residue
  there is identical. A host can dim or flag the mismatches.

## What if the structure is not my protein?

Local alignment always finds _some_ best stretch, even between unrelated
sequences, so identity over the aligned columns looks better than it is. The
package judges by identical residues over the **shorter** sequence instead.

Measured 2026-09-11 on chance alignments, that statistic gave 0.03, 0.20 and
0.24. Real structures of the transcript's protein score 0.9 or better, and an
ortholog scores about 0.6. `isLowSimilarity` sets the floor at 0.3.

Short alignments need more:

- Under 20 identical residues, the floor rises to 0.8. A 10-residue decoy with 3
  identities sits at the ordinary floor; a real bound peptide is identical or
  one residue off (1YCR's 15 p53 residues, 4ZZJ's 7).
- Under 5 identical residues, nothing passes.

`describeAlignmentQuality` and `describeTranscriptCoverage` turn the numbers
into a line such as "87% identity over 219 of 393 structure residues", so the
user sees which part of the protein the structure covers.

## The structure has several chains. Which one maps?

`chooseMappedEntity` aligns the transcript against every distinct polymer entity
and picks the best scorer. Three rules keep it from picking the large partner of
a complex:

- An **exact sequence match wins outright.**
- The score is identical residues over the **shorter** sequence, with a
  5-residue pseudocount so a two-residue fragment cannot score 1.0.
- **DNA and RNA entities are never candidates.**

On 1H26, the 11-residue p53 peptide scores 0.69 against CDK2's 0.19. Across a
ribosome's 55 chains, no decoy passes 0.29.

The function returns `undefined` when nothing maps. It never falls back to
entity 0. The old plugin did exactly that, and silently mis-mapped every
heteromeric, protein-DNA and processed-peptide structure.

Hover and click events carry the _clicked_ chain's `label_seq_id`, so
`interactionMatchesMappedEntity` lets only the mapped entity drive navigation.

## What if the structure differs from my transcript?

Substitutions, tags, deletions and loops that the crystal does not resolve are
all normal.

- **Substitutions** map position to position and show as mismatches in
  `mappedStructureIdentity`.
- **Insertions and deletions** become gaps. The residues opposite a gap map to
  nothing rather than to a neighbour.
- **Unobserved loops** leave holes in the structure sequence. The mapping
  addresses Mol\* through `Entity.seqIds`, which carries the real ids, so a hole
  does not shift the residues after it.
- **Modified residues** (MSE, TPO, ACE) are read through `sequence.code`, not
  `sequence.label`. The label spells them by component id and would shift every
  later position.

## Why do residue numbers disagree with the paper?

Papers cite the depositors' `auth_seq_id`. Mol\* addresses `label_seq_id`. The
package keeps both and never converts by adding an offset: 1TUP position 154
reads 248, and haemoglobin's author residue 1 is UniProt residue 2.
`Entity.authSeqIds` is display-only. See [coordinates.md](coordinates.md).

For UniProt numbering, `makeUniProtPositionMap` uses the SIFTS mapping from
PDBe, the authoritative source, instead of assuming an offset.

## What about fusion proteins and tags?

Fusions are where local alignment is most likely to mislead.

- Scoring over the shorter sequence means a 60-residue target fused to a
  370-residue carrier still scores near 1.0. Dividing by the entity's length
  alone scored it 0.14 and let a random 10-residue decoy beat it a third of the
  time.
- Local alignment can still bridge a gap onto the fusion partner. In 2RH1 it
  scattered 33 receptor residues onto T4 lysozyme. `fusionPartnerPositions`
  finds the residues SIFTS assigns to another protein, and
  `unmapStructurePositions` removes them from the alignment.

## What if I pass an alignment from elsewhere?

`pairwiseAlignmentProblem` rejects empty or ragged rows.
`pairwiseAlignmentSequenceProblem` checks that each row, with gaps removed,
spells the sequence you are mapping.

Without that check, an alignment made against another isoform or chain would
shift every position after the first difference, and no map would notice. Both
checks return a message instead of mapping anyway.

## What about very large proteins?

Alignment costs time and memory proportional to the product of the two lengths.
`alignmentTooLarge` skips pairs over 40 million cells, and
`alignTranscriptToEntity` returns `undefined` for them, so a titin-sized
transcript cannot lock up or crash the tab.

## What does the package not guard against?

- **Translation exceptions.** g2p_mapper assumes plain 3-letter codons.
  Selenocysteine recoding, frameshifts and other departures from the standard
  codon table are not modelled.
- **The wrong isoform.** The alignment maps whatever transcript you give it.
  `classifyIsoforms` and `selectBestTranscript` rank isoforms against a chain,
  but the caller decides which transcript is the one on screen.
- **Homology models.** AlphaFold coordinates are predictions. The mapping places
  a residue correctly; whether the structure there is accurate is a separate
  question, which `extractPerResidueConfidence` (pLDDT) answers.
- **A low-similarity result you ignore.** `isLowSimilarity` reports; the host
  decides whether to show the mapping. Show the quality line next to it.

If you find a mapping that is wrong, the fixtures in `test/` show how to turn it
into a regression test.
