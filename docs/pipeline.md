# Pipeline

How a transcript ends up mapped onto a structure. The solid path is the core;
the dashed SIFTS path replaces the local alignment's UniProt positions with the
authoritative ones when PDBe has them.

![From transcript to coordinate maps](img/pipeline.svg)

The graph source is [`img/pipeline.dot`](img/pipeline.dot); regenerate with
`dot -Tsvg docs/img/pipeline.dot -o docs/img/pipeline.svg`.

## Steps

1. **Rank isoforms.** `classifyIsoforms`, `selectBestTranscript` and
   `pickStructureSequence` rank plain `{ id, seq }` records against a chain.
2. **Find a structure.** AlphaFold, 3D-Beacons and PDBe each answer a different
   question; see [api.md](api.md#structure-sources).
3. **Load it.** The host app parses the file with Mol\*. This package never
   imports Mol\*; `extractEntities` reads the loaded model through a narrow
   structural interface.
4. **Choose the entity.** `chooseMappedEntity` aligns the transcript against
   each polymer entity and picks the one with the highest identical residues
   over the **shorter** sequence.
5. **Align.** Smith-Waterman or Needleman-Wunsch over BLOSUM62 with affine gaps.
   The alignment has two rows: row 0 is the transcript, row 1 is the structure.
6. **Build maps.** `makeCoordinateMapper` builds every conversion once from the
   alignment, branded by [coordinate space](coordinates.md).

## Why the shorter sequence

A raw match count picks the large partner of every bound peptide, and the
alignment score does not separate them either:

- **1H26**: the 11-residue p53 peptide matches 11 residues; CDK2 accrues 58
  scattered identities. Per shorter sequence, the peptide scores 0.69.
- **4ZZJ**: SIRT1 beats the 7-residue p53 peptide 63 to 6. The peptide scores
  0.50.

Dividing by length asks the question the picker has: which chain _is_ this
gene's product.

## Why format is sniffed from content

PDB read as mmCIF throws. mmCIF read as PDB succeeds and yields a model with
thousands of misread atoms and zero polymer entities, so
`structureFormatFromContent` never trusts a filename.
