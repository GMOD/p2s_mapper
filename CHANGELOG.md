## [1.4.0](https://github.com/GMOD/p2s_mapper/compare/v1.3.0...v1.4.0) (2026-10-10)

### Features

- Search UniProt by NCBI GeneID; keep AlphaFold's model id and mean pLDDT ([50907c1](https://github.com/GMOD/p2s_mapper/commit/50907c167657735a8d8c6fd5b9c3408a51a15fa3))

## [1.3.0](https://github.com/GMOD/p2s_mapper/compare/v1.2.2...v1.3.0) (2026-10-10)

### Documentation

- Restructure README into bullets, add docs/ with pipeline and coordinate diagrams ([efa26d2](https://github.com/GMOD/p2s_mapper/commit/efa26d26956e03e79bfaf47f9ae1fb257f3f2869))
- Add FAQ on mapping trust, link g2p_mapper, plain-language flowchart ([c94c2d4](https://github.com/GMOD/p2s_mapper/commit/c94c2d4f1e49c3f42a4397b55258b1e1bde8243c))
- Split the pipeline flowchart into two lanes that meet at chain choice ([ca19a3c](https://github.com/GMOD/p2s_mapper/commit/ca19a3c462c7ea8bcf409377a4736cf07be87119))
- Replace pipeline flowchart with the two-side version, and correct SIFTS's role ([aa36a8e](https://github.com/GMOD/p2s_mapper/commit/aa36a8e3d670815b4eaacc68749e92f31cafc3bc))
- Restyle the pipeline flowchart after the other repos' dataflow charts ([976d736](https://github.com/GMOD/p2s_mapper/commit/976d7367f2adc12a12bfa2f202a2a1c9e4c8ab69))
- Cut the pipeline flowchart to the main path ([631f6af](https://github.com/GMOD/p2s_mapper/commit/631f6afb0abe83f0af5193cd88bde3cb9464bce2))
- Say what 'best match' means for chain choice ([94d7b76](https://github.com/GMOD/p2s_mapper/commit/94d7b76e3122b94266ebbedb6de892405d6315e4))

### Features

- Keep only shared stretches between two isoforms; ask 3D-Beacons unfiltered ([1a9f711](https://github.com/GMOD/p2s_mapper/commit/1a9f7111180047870f3905e0581e6e1a1de52020))

## [1.2.2](https://github.com/GMOD/p2s_mapper/compare/v1.2.1...v1.2.2) (2026-10-08)

### Bug Fixes

- Look up YP_ and AP_ RefSeq proteins, and keep an empty answer when the wider taxon search fails ([f8d35e4](https://github.com/GMOD/p2s_mapper/commit/f8d35e48b47c2e27870f8fa160cb406f9cfbd794))

## [1.2.1](https://github.com/GMOD/p2s_mapper/compare/v1.2.0...v1.2.1) (2026-10-08)

### Bug Fixes

- Search a taxon's descendants when the taxon itself has no entry ([d8f74a0](https://github.com/GMOD/p2s_mapper/commit/d8f74a0e2ad16c9e43118c80ed8ae2e81db505b9))

### Documentation

- Fix anti-AI writing tropes in README ([84005ab](https://github.com/GMOD/p2s_mapper/commit/84005ab112b33ec21fdfe9e0f8612954865e4713))

## [1.2.0](https://github.com/GMOD/p2s_mapper/compare/v1.1.0...v1.2.0) (2026-09-16)

### Bug Fixes

- Do not retry a 4xx, which repeats the same answer ([1a13936](https://github.com/GMOD/p2s_mapper/commit/1a13936ff7d1b22dedaa60076463375177aed79b))

## [1.1.0](https://github.com/GMOD/p2s_mapper/compare/v1.0.0...v1.1.0) (2026-09-16)

## [1.0.0](https://github.com/GMOD/p2s_mapper/compare/v1.0.0...v1.0.0) (2026-09-16)

### Chores

- Scaffold the package from g2p_mapper's toolchain ([ddf61ef](https://github.com/GMOD/p2s_mapper/commit/ddf61ef1aae98a33553403a70be5991e81b31b53))

### Documentation

- Say what the package does and which numbering each coordinate is in ([106c216](https://github.com/GMOD/p2s_mapper/commit/106c216b080545f9308810c023ea4fcc7757d6ae))

### Features

- Pairwise alignment, its quality statistics and the coordinate maps ([82fced7](https://github.com/GMOD/p2s_mapper/commit/82fced765f920d8843ad3f968d8588268e5117c2))
- Pick the chain a transcript maps to, by identity over the shorter sequence ([34045b4](https://github.com/GMOD/p2s_mapper/commit/34045b4498e65757504d785d9ad76f7821c040c1))
- SIFTS UniProt-to-structure mapping, with author numbering ([5c233b5](https://github.com/GMOD/p2s_mapper/commit/5c233b538bf3695610f6ec21e37369f7dda808ee))
- The AlphaFold, PDBe and UniProt lookups that find a structure ([17f9887](https://github.com/GMOD/p2s_mapper/commit/17f988767463a1387fda9ed0d3af19ed327875b1))
- Structure urls and format sniffing, and the package's exports ([4e9256e](https://github.com/GMOD/p2s_mapper/commit/4e9256e0b631c9934bb3d01c480fb00ebc1c1659))

### Tests

- Bring each moved module's tests and fixtures across ([ab5abe1](https://github.com/GMOD/p2s_mapper/commit/ab5abe16b559805e9511a4bcdd7ff26040788d07))
- Bring invertMap's tests over with it ([26f3ac9](https://github.com/GMOD/p2s_mapper/commit/26f3ac93559d68d2486dc6ea1b7a8d17c3f3fddf))

