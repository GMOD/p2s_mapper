// UniProt <-> PDB residue mapping.
//
// UniProt feature coordinates are positions in the UniProt canonical sequence.
// For an AlphaFold model that *is* the structure's own sequence, so a feature at
// UniProt position p sits at structure position p - 1. For an experimental PDB
// entry it is not: the deposited construct is usually a fragment, often with
// tags or engineered residues, so the two numberings differ by a per-segment
// offset (1TUP's p53 chain starts at UniProt 94; 6VXX's spike SEQRES 33 is
// UniProt 14). The entry's own UniProt alignment, which `fetchPdbEntry` reads
// from RCSB, is the authority on that correspondence.
//
// Structure positions here index the entity's SEQRES from 0, i.e.
// label_seq_id - 1, which is this package's structure-sequence position.

/** One contiguous UniProt <-> structure correspondence for a single entity.
 * `unp*` are 1-based UniProt positions; `struct*` are 0-based inclusive
 * structure-sequence positions, this package's native coordinate. */
export interface UniProtStructureSegment {
  entityId: string
  /** author chain id, when the source names it */
  chainId?: string
  unpStart: number
  unpEnd: number
  structStart: number
  structEnd: number
}

export interface UniProtStructureMapping {
  accession: string
  /** UniProt entry name, e.g. "P53_HUMAN" */
  name?: string
  segments: UniProtStructureSegment[]
}

/**
 * Maps a 1-based UniProt position to a 0-based structure-sequence position.
 * Returns undefined for positions outside the modeled region, so callers drop
 * the feature instead of drawing it somewhere misleading.
 */
export type MapUniProtPosition = (uniprotPos: number) => number | undefined

function coveredResidues(segments: UniProtStructureSegment[]) {
  return segments.reduce((a, s) => a + (s.structEnd - s.structStart + 1), 0)
}

/** The entity a segment is matched against: its mmCIF id and the author
 * chains carrying it. */
export interface SegmentEntity {
  entityId: string
  chains: readonly string[]
}

/**
 * The segments of one accession that describe this entity. The mapping
 * numbers entities as the mmCIF does, and a PDB-format file loaded through
 * Mol* numbers them per chain (1H26.pdb's chain C is entity 2, which in the
 * mmCIF is cyclin A), so a segment naming its chain is matched by chain.
 */
function segmentsForEntity(
  mapping: UniProtStructureMapping,
  entity: SegmentEntity,
) {
  return dedupeSegments(
    mapping.segments.filter(s =>
      s.chainId === undefined
        ? s.entityId === entity.entityId
        : entity.chains.includes(s.chainId),
    ),
  )
}

/**
 * Picks the UniProt entry that describes a given entity, with its segments
 * narrowed to that entity. Only the entity the plugin has mapped to the
 * transcript is relevant — a heteromer maps each of its chains to a different
 * accession, and using the wrong one would silently annotate the wrong protein.
 * When several accessions cover the same entity (a chimeric construct) the one
 * contributing the most residues wins.
 */
export function chooseUniProtMappingForEntity(
  mappings: UniProtStructureMapping[],
  entity: SegmentEntity | undefined,
): UniProtStructureMapping | undefined {
  if (entity === undefined) {
    return undefined
  }
  let best: UniProtStructureMapping | undefined
  for (const mapping of mappings) {
    const segments = segmentsForEntity(mapping, entity)
    if (
      segments.length > 0 &&
      (!best || coveredResidues(segments) > coveredResidues(best.segments))
    ) {
      best = { ...mapping, segments }
    }
  }
  return best
}

const OWN_PSEUDOCOUNT = 5
const MIN_OWN_IDENTITY = 0.5

/**
 * Mapped structure positions the entry's UniProt alignment assigns to a
 * protein other than the transcript's, on a chain that fuses two. Local
 * alignment bridges a fusion boundary, and on every GPCR fusion construct
 * checked it scattered receptor residues onto the partner, 33 of them onto T4
 * lysozyme in 2RH1.
 *
 * `mapped` is each mapped structure position and whether its pair is
 * identical. The transcript's own accession is the one whose covered positions
 * are most often identical, plus a pseudocount, as the chain picker scores
 * chains. A count of covered positions would not do: TP53's 11-residue peptide
 * fused to CDK2 covers 11 positions against 224 chance hits on the kinase, and
 * counting unmapped the peptide. Unless that accession reaches half identity
 * the transcript is taken to be neither protein, and nothing is unmapped.
 * Residues assigned to no accession, such as tags, stay mapped.
 */
export function fusionPartnerPositions(
  mappings: UniProtStructureMapping[],
  entity: SegmentEntity | undefined,
  mapped: ReadonlyMap<number, boolean>,
) {
  const partners = new Set<number>()
  const byAccession = entity
    ? mappings
        .map(m => segmentsForEntity(m, entity))
        .filter(segments => segments.length > 0)
    : []
  if (byAccession.length < 2) {
    return partners
  }
  const covers = (segments: UniProtStructureSegment[], pos: number) =>
    segments.some(s => pos >= s.structStart && pos <= s.structEnd)
  const identity = byAccession.map(segments => {
    let covered = 0
    let identical = 0
    for (const [pos, same] of mapped) {
      if (covers(segments, pos)) {
        covered++
        identical += same ? 1 : 0
      }
    }
    return identical / (covered + OWN_PSEUDOCOUNT)
  })
  const ownIdentity = Math.max(...identity)
  if (ownIdentity < MIN_OWN_IDENTITY) {
    return partners
  }
  const own = byAccession[identity.indexOf(ownIdentity)]!
  for (const pos of mapped.keys()) {
    if (
      !covers(own, pos) &&
      byAccession.some(segments => segments !== own && covers(segments, pos))
    ) {
      partners.add(pos)
    }
  }
  return partners
}

// The mapping lists one segment per *chain*, so the several chains of a
// homodimer repeat the same entity-level correspondence. They collapse to one.
function dedupeSegments(segments: UniProtStructureSegment[]) {
  const seen = new Set<string>()
  return segments.filter(s => {
    const key = `${s.unpStart}-${s.unpEnd}-${s.structStart}-${s.structEnd}`
    const isNew = !seen.has(key)
    seen.add(key)
    return isNew
  })
}

/** 1-based UniProt position -> 0-based structure position, for an AlphaFold
 * model whose sequence is the UniProt sequence. */
export const identityUniProtPositionMap: MapUniProtPosition = uniprotPos =>
  uniprotPos - 1

export function makeUniProtPositionMap(
  segments: UniProtStructureSegment[],
): MapUniProtPosition {
  return uniprotPos => {
    const segment = segments.find(
      s => uniprotPos >= s.unpStart && uniprotPos <= s.unpEnd,
    )
    if (!segment) {
      return undefined
    }
    const pos = segment.structStart + (uniprotPos - segment.unpStart)
    return pos <= segment.structEnd ? pos : undefined
  }
}
