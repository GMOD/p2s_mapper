# Pipeline

The chart shows the main path from a gene to a 3D structure. The host finds the
gene's protein and a structure separately, matches the protein to one of the
structure's chains, and builds a lookup in both directions from the alignment of
that match. The steps below add three things the chart omits: the choice of
structure source, the quality check and the optional fusion-partner trim.

![From a gene on the genome to a residue in 3D, and back](img/pipeline.svg)

The chart's source is [`img/pipeline.dot`](img/pipeline.dot); regenerate the SVG
with `dot -Tsvg docs/img/pipeline.dot -o docs/img/pipeline.svg`.

p2s_mapper has no function that runs the whole pipeline, so the host app calls
each step. The chart shows the order in which each step needs an earlier one's
output.

## Steps

**Gene side**

1. **Build the position table.**
   [g2p_mapper](https://github.com/GMOD/g2p_mapper) builds the genome ↔ protein
   position table, and the host translates the gene. p2s_mapper uses g2p_mapper
   only in `codonGenomeSpan`, which calls `getCodonRanges`.

**Structure side**

2. **Look up the protein.** `searchUniProtEntries` finds the UniProt entry from
   the gene's database ids or name.
3. **Choose a source.** Use an AlphaFold model (`fetchAlphaFoldModels`) or an
   experimental PDB entry (`fetchExperimentalStructures`), or let the user name
   a structure. See [api.md](api.md#structure-sources).
4. **Read the chains.** The host loads the file in Mol\*, and `extractEntities`
   reads each chain's sequence from the loaded model.

**Matching the protein to a chain**

5. **Match the chain.** `chooseMappedEntity` picks the chain that best matches
   the gene's protein, in two tiers:
   - A chain whose sequence is **identical** to the protein wins outright, with
     no alignment search.
   - Otherwise it aligns the protein against every protein chain and keeps the
     highest score: identical residues over the shorter sequence, plus a
     5-residue pseudocount. It skips DNA and RNA chains.

   `chooseMappedEntity` returns the best match even when it is poor, so step 6
   checks it. The same call returns the alignment, so there is no separate
   alignment step. The alignment is Smith-Waterman or Needleman-Wunsch over
   BLOSUM62 with affine gaps; row 0 is the transcript and row 1 the structure.

6. **Check the match (advisory).** `alignmentQuality` and `isLowSimilarity` flag
   a weak match, and this is the only step that catches a poor best match. The
   host decides what to show for a low-similarity match.
7. **Trim fusion partners (optional, PDB only).** `fetchPdbEntry` reads the
   entry's UniProt alignment from RCSB. `fusionPartnerPositions` finds the
   residues that alignment assigns to a fused partner protein, and
   `unmapStructurePositions` removes them. `makeUniProtPositionMap` places
   UniProt annotations. The residue mapping itself comes from the package's
   alignment, not from the entry's.
8. **Build the lookup tables.** `makeCoordinateMapper` builds every conversion
   once from the alignment, with a separate type for each
   [kind of position](coordinates.md).

The [FAQ](faq.md) covers how far to trust the result.

## Why the score divides by the shorter sequence

Ranked by raw match count, `chooseMappedEntity` would pick the large partner of
every bound peptide, and ranking by alignment score would not separate them
either:

- **1H26**: the 11-residue p53 peptide matches 11 residues, and CDK2 has 58
  scattered identities. Divided by the shorter sequence, the peptide scores
  0.69.
- **4ZZJ**: SIRT1 has 63 identical residues and the 7-residue p53 peptide has 6.
  The peptide scores 0.50.

Identical residues over the shorter length is the fraction of the smaller
sequence that the other reproduces, so the highest-scoring chain is the gene's
product.

## Why the format is detected from content

PDB read as mmCIF throws. mmCIF read as PDB succeeds and yields a model with
thousands of misread atoms and zero polymer entities, so a host should detect
the format with `structureFormatFromContent`, which reads the file's text,
rather than trust the filename.
