# Pipeline

How a gene ends up mapped onto a 3D structure. The solid path is the core. The
dashed path cross-checks against PDBe's official numbering (SIFTS) when it has
one.

![From a gene to a clickable structure](img/pipeline.svg)

The graph source is [`img/pipeline.dot`](img/pipeline.dot); regenerate with
`dot -Tsvg docs/img/pipeline.dot -o docs/img/pipeline.svg`.

The chart has two lanes that run independently and meet when the chain is
picked: lane 1 turns the gene into a protein sequence, lane 2 finds a 3D
structure. Neither needs the other until then, because choosing the chain
compares the two sequences.

## Steps, with the functions behind each box

1. **A gene, spelled as a protein.** Genome ↔ protein positions belong to
   [g2p_mapper](https://github.com/GMOD/g2p_mapper); this package starts from
   the protein sequence it produces. When a gene has several isoforms,
   `classifyIsoforms`, `selectBestTranscript` and `pickStructureSequence` rank
   them against a chain.
2. **Look up structures.** AlphaFold, 3D-Beacons and PDBe each answer a
   different question; see [api.md](api.md#structure-sources).
3. **Pick the chain.** The host app loads the file in Mol\*. A structure often
   holds several molecules, so `chooseMappedEntity` scores each one and keeps
   the one that is the gene's protein. This package never imports Mol\*;
   `extractEntities` reads the loaded model through a narrow interface.
4. **Line the sequences up.** `runLocalAlignment` runs Smith-Waterman or
   Needleman-Wunsch over BLOSUM62 with affine gaps. The alignment has two rows:
   row 0 is the transcript, row 1 is the structure.
5. **Cross-check (optional).** `fetchUniProtStructureMappings` and
   `makeUniProtPositionMap` bring in PDBe's SIFTS numbering for UniProt
   positions.
6. **Build the lookup tables.** `makeCoordinateMapper` builds every conversion
   once from the alignment, branded by [coordinate space](coordinates.md).

Worried the result is wrong? See the [FAQ](faq.md).

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
