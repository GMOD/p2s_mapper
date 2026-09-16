# p2s_mapper

Map a transcript's translation onto a protein structure: the pairwise alignment
between them, the coordinate maps that alignment implies, which chain of the
structure is the gene's product, SIFTS residue numbering, and the AlphaFold,
PDBe and UniProt lookups that find a structure to map in the first place.

Extracted from
[jbrowse-plugin-protein3d](https://github.com/GMOD/jbrowse-plugin-protein3d),
which is where the measurements behind the scoring rules were made. The package
has no React, no JBrowse and no Mol\* dependency: a loaded Mol\* model reaches
it through narrow structural interfaces, and `g2p_mapper` is the only runtime
dependency.

## Install

```
npm install p2s_mapper
```

## Coordinate conventions

One residue has up to four numbers, and mixing them is the off-by-one class of
bug this package exists to prevent. **Every stored or computed coordinate is a
0-based position**: an index into the ungapped structure sequence or the
ungapped transcript sequence, which is the one numbering that is dense and
zero-based whatever the file. `coordinates.ts` brands the three internal spaces
— structure position, transcript position, alignment column — so the compiler
rejects mixing them. Two conversions leave that space, and each has one door.
**Mol\* is addressed by `label_seq_id`**, which is `position + 1` only for a
file carrying `entity_poly_seq` or SEQRES; a SEQRES-less PDB numbers its
observed residues by author numbering and leaves holes at unobserved loops, so
`Entity.seqIds` carries the real ids and every crossing goes through
`toLabelSeqIds`, `rangeToLabelSeqIds` or `makeLabelSeqIdIndex`. **The user is
shown `auth_seq_id`**, the depositors' numbering, which is what papers and
UniProt cite (1TUP position 154 reads 248) and what Mol\*'s own hover shows;
`Entity.authSeqIds` carries it and it is display-only. UniProt positions are
1-based, and `pdbUniProtMapping` converts them with SIFTS rather than assuming
any offset.

## Exports

### Alignment

`runLocalAlignment`, `scoredAlignment`, `needlemanWunsch`, `smithWaterman`,
`selfScore`, `alignmentTooLarge`, `MAX_ALIGNMENT_CELLS` — Smith-Waterman and
Needleman-Wunsch over BLOSUM62, with affine gaps and a packed traceback.

`PairwiseAlignment`, `transcriptAlignedSeq`, `structureAlignedSeq`,
`alignmentLength`, `pairwiseAlignmentProblem`,
`pairwiseAlignmentSequenceProblem`, `mappedStructureIdentity`,
`unmapStructurePositions` — the two-row alignment, whose **row order is a
contract**: row 0 is the transcript, row 1 is the structure. Read it through the
accessors, not by index.

`alignmentQuality`, `isLowSimilarity`, `describeAlignmentQuality`,
`describeTranscriptCoverage`, `describeCoveredRange` — identity over the shorter
sequence is what separates a real match from a chance local alignment; local
identity alone does not.

`AlignmentAlgorithm`, `coerceAlignmentAlgorithm`, `ALIGNMENT_ALGORITHM_LABELS`.

### Coordinates

`makeCoordinateMapper`, `CoordinateMapper`, `transcriptRangeToStructureRange`,
`structurePos`, `transcriptPos`, `alignmentCol` — every conversion built once
from an alignment, branded by space.

`structureSeqVsTranscriptSeqMap`, `structurePositionToAlignmentMap`,
`transcriptPositionToAlignmentMap`, `invertMap`, `codonGenomeSpan`,
`stripStopCodon`, `stripAllStopCodons`.

### Chain choice

`chooseMappedEntity`, `alignTranscriptToEntity`, `explainedFraction`,
`interactionMatchesMappedEntity` — which polymer entity is the transcript's
product, ranked by identical residues over the **shorter** of the two sequences.
A raw match count picks the large partner of every bound peptide, and the
alignment score does not separate them either.

`extractEntities`, `extractStructureSequences`, `entityLabel`, `residueNumber`,
`residueRangeToPositions`, `fillAuthSeqIds`, `oneLetterSequence`,
`toLabelSeqIds`, `rangeToLabelSeqIds`, `makeLabelSeqIdIndex` — read a loaded
Mol\* model through a structural interface. Read `sequence.code`, never
`sequence.label`: `label` spells MSE, TPO and ACE by component id, so the string
outgrows `seqId` and every later position addresses the wrong residue.

`extractPerResidueConfidence`, `looksLikePlddt` — AlphaFold's pLDDT out of the
B-factor column, keyed by `label_seq_id` because the hierarchy holds only
observed residues.

`classifyIsoforms`, `selectBestTranscript`, `pickStructureSequence` — rank plain
`{ id, seq }` isoform records against a chain.

### SIFTS

`fetchUniProtStructureMappings`, `parseUniProtStructureMappings`,
`pdbeSiftsUrl`, `chooseUniProtMappingForEntity`, `makeUniProtPositionMap`,
`identityUniProtPositionMap`, `fusionPartnerPositions` — the authoritative
UniProt ↔ structure alignment. `fusionPartnerPositions` unmaps the residues
SIFTS gives another protein on a fusion construct, which local alignment
otherwise bridges (2RH1 scatters 33 receptor residues onto T4 lysozyme).

`toAuthorRange`, `segmentsForAccession` — the author-numbered range a UniProt
range is cited by. Haemoglobin numbers from the mature protein, so author
residue 1 is UniProt residue 2.

### Structure sources

`fetchAlphaFoldModels`, `parseAlphaFoldModels`, `pickAlphaFoldModel` — asked
rather than derived: a protein past AlphaFold's length cap has no F1 model at
all, and the model version moves.

`fetchExperimentalStructures`, `parseExperimentalStructures` — 3D-Beacons'
experimental entries, PDBe only, because SASBDB's scattering fits file under the
same category with near-full coverage and no residue mapping.

`pdbeBestStructuresUrl`, `parseBestStructures`, `isPdbId`,
`pdbeEntryMoleculesUrl`, `parseEntryMolecules`, `searchUniProtEntries`,
`buildGeneNameQuery`, `isRecognizedDatabaseId`, `buildUniProtXrefQuery`,
`getDbIdLabel`, `stripTrailingVersion`.

Every request takes its `fetch` from the call —
`{ fetch?: typeof fetch, signal? }`, defaulting to `globalThis.fetch` — so a
host can hand in an instrumented one and a test can hand in a double.

### Urls and formats

`getPdbStructureUrl`, `getAlphaFoldStructureUrl`, `resolveStructureUrl`,
`getPdbIdFromUrl`, `getUniprotIdFromAlphaFoldTarget`,
`getStructureUrlFromTarget`, `getConfidenceUrlFromTarget`,
`structureDisplayLabel`, `uniprotGffUrl`, `uniprotFastaUrl`, `uniprotEntryUrl`,
`rcsbEntryUrl`.

`structureFormatFromContent`, `structureFormatFromName`,
`structureFileExtension`, `isBinaryStructureUrl` — which parser a structure
needs, sniffed from **content** rather than a filename. Getting it wrong fails
asymmetrically: PDB read as mmCIF throws, while mmCIF read as PDB succeeds and
yields a model with thousands of misread atoms and zero polymer entities.

`caCoordsToPdb`, `hasValidCaCoords` — a PDB file from Foldseek Cα coordinates.

`rawfetch`, `myfetch`, `jsonfetch`, `httpError`, `networkError`, `abortError`,
`timeout`, `FetchOptions`.

## License

MIT
