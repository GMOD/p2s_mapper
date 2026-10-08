# API reference

Every export, grouped by job. For how the pieces fit together, see
[pipeline.md](pipeline.md); for the numbering rules, see
[coordinates.md](coordinates.md).

- [Alignment](#alignment)
- [Coordinates](#coordinates)
- [Chain choice](#chain-choice)
- [SIFTS](#sifts)
- [Structure sources](#structure-sources)
- [URLs and formats](#urls-and-formats)
- [Fetch helpers](#fetch-helpers)

## Alignment

**Aligners**

- `runLocalAlignment`, `scoredAlignment`, `needlemanWunsch`, `smithWaterman` —
  BLOSUM62 with affine gaps and a packed traceback
- `selfScore`, `alignmentTooLarge`, `MAX_ALIGNMENT_CELLS`
- `AlignmentAlgorithm`, `coerceAlignmentAlgorithm`, `ALIGNMENT_ALGORITHM_LABELS`

**The alignment object**

`PairwiseAlignment` has two rows, and **the row order is a contract**: row 0 is
the transcript, row 1 is the structure. Read it through the accessors, not by
index.

- `transcriptAlignedSeq`, `structureAlignedSeq`, `alignmentLength`
- `pairwiseAlignmentProblem`, `pairwiseAlignmentSequenceProblem`
- `mappedStructureIdentity`, `unmapStructurePositions`

**Quality**

- `alignmentQuality`, `isLowSimilarity`
- `describeAlignmentQuality`, `describeTranscriptCoverage`,
  `describeCoveredRange`

Identity over the shorter sequence separates a real match from a chance local
alignment. Local identity alone does not.

## Coordinates

Every conversion is built once from an alignment and branded by space.

- `makeCoordinateMapper`, `CoordinateMapper`, `transcriptRangeToStructureRange`
- `structurePos`, `transcriptPos`, `alignmentCol` — the brand constructors
- `structureSeqVsTranscriptSeqMap`, `structurePositionToAlignmentMap`,
  `transcriptPositionToAlignmentMap`, `invertMap`
- `codonGenomeSpan`, `stripStopCodon`, `stripAllStopCodons`

## Chain choice

**Pick the entity**

- `chooseMappedEntity`, `alignTranscriptToEntity`, `explainedFraction`
- `interactionMatchesMappedEntity` — only the mapped entity may drive navigation

Entities rank by identical residues over the **shorter** sequence; see
[pipeline.md](pipeline.md#why-the-shorter-sequence).

**Read a loaded Mol\* model**

- `extractEntities`, `extractStructureSequences`, `entityLabel`
- `residueNumber`, `residueRangeToPositions`, `fillAuthSeqIds`,
  `oneLetterSequence`
- `toLabelSeqIds`, `rangeToLabelSeqIds`, `makeLabelSeqIdIndex`

Read `sequence.code`, never `sequence.label`. `label` spells MSE, TPO and ACE by
component id, so the string outgrows `seqId` and every later position addresses
the wrong residue.

**Per-residue confidence**

- `extractPerResidueConfidence`, `looksLikePlddt` — AlphaFold's pLDDT from the
  B-factor column, keyed by `label_seq_id` because the hierarchy holds only
  observed residues

**Isoforms**

- `classifyIsoforms`, `selectBestTranscript`, `pickStructureSequence` — rank
  plain `{ id, seq }` records against a chain

## SIFTS

The authoritative UniProt ↔ structure alignment.

- `fetchUniProtStructureMappings`, `parseUniProtStructureMappings`,
  `pdbeSiftsUrl`
- `chooseUniProtMappingForEntity`, `makeUniProtPositionMap`,
  `identityUniProtPositionMap`
- `fusionPartnerPositions` — unmaps the residues SIFTS gives another protein on
  a fusion construct, which local alignment otherwise bridges (2RH1 scatters 33
  receptor residues onto T4 lysozyme)
- `toAuthorRange`, `segmentsForAccession` — the author-numbered range a UniProt
  range is cited by. Haemoglobin numbers from the mature protein, so author
  residue 1 is UniProt residue 2

## Structure sources

- **AlphaFold**: `fetchAlphaFoldModels`, `parseAlphaFoldModels`,
  `pickAlphaFoldModel`. The package asks rather than derives: a protein past
  AlphaFold's length cap has no F1 model at all, and the model version moves.
- **3D-Beacons**: `fetchExperimentalStructures`, `parseExperimentalStructures`.
  PDBe entries only, because SASBDB's scattering fits file under the same
  category with near-full coverage and no residue mapping.
- **PDBe**: `pdbeBestStructuresUrl`, `parseBestStructures`, `isPdbId`,
  `pdbeEntryMoleculesUrl`, `parseEntryMolecules`
- **UniProt search**: `searchUniProtEntries`, `buildGeneNameQuery`,
  `buildUniProtXrefQuery`, `isRecognizedDatabaseId`, `getDbIdLabel`,
  `stripTrailingVersion`

Every request takes its `fetch` from the call —
`{ fetch?: typeof fetch, signal? }`, defaulting to `globalThis.fetch` — so a
host can pass an instrumented one and a test can pass a double.

## URLs and formats

**URLs**

- `getPdbStructureUrl`, `getAlphaFoldStructureUrl`, `resolveStructureUrl`
- `getPdbIdFromUrl`, `getUniprotIdFromAlphaFoldTarget`,
  `getStructureUrlFromTarget`, `getConfidenceUrlFromTarget`
- `structureDisplayLabel`
- `uniprotGffUrl`, `uniprotFastaUrl`, `uniprotEntryUrl`, `rcsbEntryUrl`

**Formats**

- `structureFormatFromContent`, `structureFormatFromName`,
  `structureFileExtension`, `isBinaryStructureUrl`

`structureFormatFromContent` sniffs **content**, not the filename, because mmCIF
read as PDB succeeds with thousands of misread atoms and zero polymer entities.

**Foldseek**

- `caCoordsToPdb`, `hasValidCaCoords` — a PDB file from Cα coordinates

## Fetch helpers

- `rawfetch`, `myfetch`, `jsonfetch`, `FetchOptions`
- `httpError`, `HttpError`, `networkError`, `abortError`, `timeout`
- `isDefinitiveFailure`

A failed response throws an `HttpError` carrying its `status`.
`isDefinitiveFailure` is true for a 4xx: the server understood and declined, so
retrying repeats the answer. `fetchUniProtStructureMappings` uses it, since PDBe
answers 404 for an entry with no UniProt mapping at all.
