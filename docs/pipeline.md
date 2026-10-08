# Pipeline

How a gene ends up mapped onto a 3D structure. The chart has two sides that run
independently and meet at the chain match. Dashed boxes are optional or
advisory.

![From a gene on the genome to a residue in 3D, and back](img/pipeline.svg)

The graph source is [`img/pipeline.dot`](img/pipeline.dot); regenerate with
`dot -Tsvg docs/img/pipeline.dot -o docs/img/pipeline.svg`.

p2s_mapper is a toolkit of separate functions with no orchestrator, so the host
app wires them together. The chart shows the order their dependencies force.

## Steps, with the functions behind each box

**Gene side**

1. **The gene and its table.** [g2p_mapper](https://github.com/GMOD/g2p_mapper)
   builds the genome ↔ protein position table. This package calls only its
   `getCodonRanges`, through `codonGenomeSpan`; the host builds the table and
   translates the gene.

**Structure side**

2. **Look up the protein.** `searchUniProtEntries` finds the UniProt entry by
   the gene's database IDs or name.
3. **Choose a source.** AlphaFold (`fetchAlphaFoldModels`) or lab-solved PDB
   entries (`fetchExperimentalStructures`, `pdbeBestStructuresUrl`). The user
   can also name a structure directly. See [api.md](api.md#structure-sources).
4. **Read the chains.** The host loads the file in Mol\*, and `extractEntities`
   reads each chain's sequence through a narrow interface. This package never
   imports Mol\*.

**Where they meet**

5. **Match the chain.** `chooseMappedEntity` aligns the gene's protein against
   every chain and keeps the best match. The same call returns the alignment, so
   there is no separate "align" step. The alignment is Smith-Waterman or
   Needleman-Wunsch over BLOSUM62 with affine gaps; row 0 is the transcript, row
   1 is the structure.
6. **Check the match (advisory).** `alignmentQuality` and `isLowSimilarity` flag
   a weak match. Nothing blocks on it, so the host decides what to show.
7. **Trim with SIFTS (optional, PDB only).** `fusionPartnerPositions` finds
   residues PDBe assigns to a fused partner protein, and
   `unmapStructurePositions` removes them. `makeUniProtPositionMap` places
   UniProt annotations. The residue mapping itself comes from the alignment, not
   from SIFTS.
8. **Build the lookup tables.** `makeCoordinateMapper` builds every conversion
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
