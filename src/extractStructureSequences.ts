import { valuesByEntityAndLabelSeqId } from './residueWalk.ts'

/** A polymer entity of a loaded structure: its mmCIF entity id, its one-letter
 * sequence, and the molstar `label_seq_id` of each residue.
 *
 * Structure positions are 0-based indices into `seq`, and molstar selects
 * residues by `label_seq_id`. The two differ by 1 only when the entity's
 * sequence covers every residue from 1, which holds for any mmCIF with an
 * `entity_poly_seq` category (all of RCSB and AlphaFold) and for a PDB file
 * with SEQRES records, from which molstar builds that category.
 *
 * For a PDB file without SEQRES, molstar falls back to
 * `StructureSequence.fromHierarchy` and takes `label_seq_id` from the observed
 * residues' author numbering: a chain whose coordinates start at residue 94 has
 * seqIds 94.., and an unobserved loop leaves a gap. Adding 1 there is off by the
 * whole offset, in both directions, so convert through `seqIds`.
 */
export interface Entity {
  /** mmCIF entity id */
  entityId: string
  /** one letter per residue, observed or not */
  seq: string
  /** molstar `label_seq_id` per position of `seq` */
  seqIds: number[]
  /** author chain ids of this entity, e.g. ['A', 'B'] for a homodimer, as
   * the PDB entry page lists them */
  chains: string[]
  /** DNA, RNA or a hybrid, by molstar's entity subtype. A, C, G, T and U
   * are amino-acid letters too, so chooseMappedEntity skips these. */
  nucleicAcid?: boolean
  /** `auth_seq_id` per position: the depositors' numbering, which papers cite
   * (1TUP's position 154 is R248) and Mol*'s hover shows. For display only;
   * use `seqIds` to select residues in Mol*. Absent when the model has no
   * atomic hierarchy. See `residueNumber`. */
  authSeqIds?: number[]
  /** the UniProt entry the file says this entity was predicted from; see
   * `EntityUniProtReference` */
  uniProt?: EntityUniProtReference
}

/**
 * The UniProt entry a ModelCIF file names for an entity, in
 * `ma_target_ref_db_details`. AlphaFold DB writes it into every model, so a
 * complex's file says which protein each chain is, and an isoform model names
 * its isoform (P04637-2). Kept only when the stated span is exactly the
 * entity's length, so position `pos` is UniProt residue `start + pos`.
 */
export interface EntityUniProtReference {
  accession: string
  /** UniProt entry name, e.g. "GSTP1_HUMAN" */
  name?: string
  gene?: string
  /** 1-based UniProt residue of the entity's first position */
  start: number
}

export interface Column<T> {
  rowCount: number
  value(row: number): T
}

export interface StructureModel {
  obj?: {
    data: {
      entities?: {
        subtype: Column<string>
        getEntityIndex(id: string): number
      }
      sourceData?: { data: unknown }
      sequence: {
        sequences: readonly {
          entityId: string
          sequence: {
            code: {
              toArray(): ArrayLike<string>
            }
            seqId: {
              toArray(): ArrayLike<number>
            }
          }
        }[]
      }
      atomicHierarchy?: {
        chains: {
          label_entity_id: Column<string>
          auth_asym_id: Column<string>
        }
        residues?: {
          label_seq_id: Column<number>
          auth_seq_id: Column<number>
        }
        residueAtomSegments?: { offsets: ArrayLike<number>; count: number }
        chainAtomSegments?: { index: ArrayLike<number> }
      }
    }
  }
}

/** Observed residues' label_seq_id -> auth_seq_id, per entity. The first chain
 * carrying an entity wins, so a homodimer's copies agree. */
function authSeqIdsByEntity(model: StructureModel) {
  const { residues, residueAtomSegments, chainAtomSegments, chains } =
    model.obj?.data.atomicHierarchy ?? {}
  return residues && residueAtomSegments && chainAtomSegments && chains
    ? valuesByEntityAndLabelSeqId(
        { residues, residueAtomSegments, chainAtomSegments, chains },
        residue => residues.auth_seq_id.value(residue),
      )
    : undefined
}

/**
 * Author numbering for every SEQRES position, observed or not. A residue with
 * no atoms has no auth_seq_id of its own, so it takes the offset of the nearest
 * observed residue before it (after it, at an unobserved N-terminus): a
 * disordered loop keeps counting the way the paper does. With nothing observed
 * the label numbering stands.
 */
export function fillAuthSeqIds(
  seqIds: number[],
  observed: Map<number, number> | undefined,
) {
  const out: number[] = []
  let offset: number | undefined
  const firstObserved = seqIds.find(id => observed?.has(id))
  if (firstObserved !== undefined) {
    offset = observed!.get(firstObserved)! - firstObserved
  }
  for (const id of seqIds) {
    const auth = observed?.get(id)
    if (auth !== undefined) {
      offset = auth - id
    }
    out.push(id + (offset ?? 0))
  }
  return out
}

/** The number a residue is called by: author numbering when the file carries
 * it, else molstar's label_seq_id, which is the author numbering already for a
 * SEQRES-less PDB and 1..N for everything else. */
export function residueNumber(entity: Entity | undefined, pos: number) {
  return entity?.authSeqIds?.[pos] ?? entity?.seqIds[pos] ?? pos + 1
}

function chainsByEntity(model: StructureModel) {
  const chains = model.obj?.data.atomicHierarchy?.chains
  const byEntity = new Map<string, string[]>()
  if (chains) {
    for (let i = 0; i < chains.label_entity_id.rowCount; i++) {
      const entityId = chains.label_entity_id.value(i)
      const chain = chains.auth_asym_id.value(i)
      const list = byEntity.get(entityId) ?? []
      if (!list.includes(chain)) {
        list.push(chain)
      }
      byEntity.set(entityId, list)
    }
  }
  return byEntity
}

// mmCIF entity_poly.type values for nucleic-acid polymers. Molstar derives the
// subtype from residue components when a file (PDB format) carries no
// entity_poly, so the flag is available for either format.
const NUCLEIC_ACID_SUBTYPES = new Set([
  'polydeoxyribonucleotide',
  'polyribonucleotide',
  'polydeoxyribonucleotide/polyribonucleotide hybrid',
  'peptide nucleic acid',
])

function isNucleicAcid(model: StructureModel, entityId: string) {
  const entities = model.obj?.data.entities
  if (!entities) {
    return false
  }
  const index = entities.getEntityIndex(entityId)
  return index >= 0 && NUCLEIC_ACID_SUBTYPES.has(entities.subtype.value(index))
}

/** The slice of molstar's MmcifFormat data read here; other formats have no
 * `db` or `frame`. `frame` is the parsed file itself, holding every field it
 * writes, where `db` keeps only those molstar's schema names: its
 * `ma_target_ref_db_details` has no `gene_name`. */
interface MmcifSourceData {
  db?: {
    entity_poly?: {
      entity_id: Column<string>
      pdbx_seq_one_letter_code_can: Column<string>
    }
  }
  frame?: {
    categories: Record<
      string,
      | {
          rowCount: number
          getField(name: string): { str(row: number): string } | undefined
        }
      | undefined
    >
  }
}

function mmcifSource(model: StructureModel) {
  return model.obj?.data.sourceData?.data as MmcifSourceData | undefined
}

/** Each entity's UniProt reference, with the length of the span it states */
function uniProtReferencesByEntity(model: StructureModel) {
  const refs = mmcifSource(model)?.frame?.categories.ma_target_ref_db_details
  const byEntity = new Map<
    string,
    { reference: EntityUniProtReference; length: number }
  >()
  const field = (name: string, row: number) =>
    refs?.getField(name)?.str(row) ?? ''
  for (let i = 0; i < (refs?.rowCount ?? 0); i++) {
    const accession = field('db_accession', i)
    const start = Number(field('seq_db_align_begin', i))
    const end = Number(field('seq_db_align_end', i))
    if (
      field('db_name', i) === 'UNP' &&
      accession &&
      Number.isInteger(start) &&
      Number.isInteger(end) &&
      start >= 1
    ) {
      byEntity.set(field('target_entity_id', i), {
        reference: {
          accession,
          name: field('db_code', i) || undefined,
          gene: field('gene_name', i) || undefined,
          start,
        },
        length: end - start + 1,
      })
    }
  }
  return byEntity
}

function canonicalSequencesByEntity(model: StructureModel) {
  const entityPoly = mmcifSource(model)?.db?.entity_poly
  const byEntity = new Map<string, string>()
  if (entityPoly) {
    for (let i = 0; i < entityPoly.entity_id.rowCount; i++) {
      byEntity.set(
        entityPoly.entity_id.value(i),
        entityPoly.pdbx_seq_one_letter_code_can.value(i).replaceAll(/\s/g, ''),
      )
    }
  }
  return byEntity
}

/**
 * One letter per position, so `seq[pos]` and `seqIds[pos]` name the same
 * residue. Molstar's `label` column is not that: it spells a residue with no
 * one-letter code by its component id (MSE, TPO, ACE) and an alternate site as
 * "(S|P)", which shifted every later position. `code` writes X for those; the
 * mmCIF canonical sequence then supplies the parent residue (MSE is M) when it
 * has one letter per position, which a chromophore spelled "TYG" does not.
 */
export function oneLetterSequence(
  codes: ArrayLike<string>,
  canonical: string | undefined,
) {
  const letters = Array.from(codes)
  return letters
    .map((c, i) =>
      c === 'X' && canonical?.length === letters.length ? canonical[i]! : c,
    )
    .join('')
}

export function extractEntities(model: StructureModel): Entity[] | undefined {
  const chains = chainsByEntity(model)
  const authIds = authSeqIdsByEntity(model)
  const canonical = canonicalSequencesByEntity(model)
  const references = uniProtReferencesByEntity(model)
  return model.obj?.data.sequence.sequences.map(s => {
    const seqIds = Array.from(s.sequence.seqId.toArray())
    const seq = oneLetterSequence(
      s.sequence.code.toArray(),
      canonical.get(s.entityId),
    )
    const ref = references.get(s.entityId)
    const uniProt = ref?.length === seq.length ? ref.reference : undefined
    return {
      entityId: s.entityId,
      seq,
      seqIds,
      chains: chains.get(s.entityId) ?? [],
      ...(isNucleicAcid(model, s.entityId) ? { nucleicAcid: true } : {}),
      ...(authIds
        ? { authSeqIds: fillAuthSeqIds(seqIds, authIds.get(s.entityId)) }
        : {}),
      ...(uniProt ? { uniProt } : {}),
    }
  })
}

/** A user-facing name for an entity: its chains when known, else its id. */
export function entityLabel(entity: Entity) {
  const chains =
    entity.chains.length > 0
      ? `Chain ${entity.chains.join('/')}`
      : `Entity ${entity.entityId}`
  return `${chains} (${entity.seq.length} ${entity.nucleicAcid ? 'nt' : 'aa'})`
}

/** The protein chains' sequences, for ranking isoforms against a structure.
 * DNA chains are left out, because their letters align as amino acids. */
export function extractStructureSequences(
  model: StructureModel,
): string[] | undefined {
  return extractEntities(model)
    ?.filter(e => !e.nucleicAcid)
    .map(e => e.seq)
}

/** The molstar `label_seq_id` of one 0-based structure position, or
 * undefined for a position the entity lacks or no position at all. */
export function labelSeqIdAt(
  entity: { seqIds: readonly number[] },
  pos: number | undefined,
) {
  return pos === undefined ? undefined : entity.seqIds[pos]
}

/**
 * The molstar `label_seq_id`s for a set of 0-based structure positions. Unknown
 * positions are dropped rather than guessed, so an out-of-range position paints
 * nothing instead of painting something wrong.
 */
export function toLabelSeqIds(
  entity: Entity | undefined,
  positions: Iterable<number>,
): number[] {
  if (!entity) {
    return []
  }
  const out: number[] = []
  for (const pos of positions) {
    const id = entity.seqIds[pos]
    if (id !== undefined) {
      out.push(id)
    }
  }
  return out
}

/** As toLabelSeqIds, for a half-open [start, end) structure-position range. */
export function rangeToLabelSeqIds(
  entity: Entity | undefined,
  range: { start: number; end: number } | undefined,
): number[] {
  if (!entity || !range) {
    return []
  }
  const start = Math.max(0, range.start)
  const end = Math.min(entity.seqIds.length, range.end)
  return end > start ? entity.seqIds.slice(start, end) : []
}

/** Reverse of `seqIds`: molstar's label_seq_id -> 0-based structure position. */
export function makeLabelSeqIdIndex(entity: Entity | undefined) {
  const index = new Map<number, number>()
  entity?.seqIds.forEach((id, pos) => {
    // first wins: duplicate ids (micro-heterogeneity) collapse to one residue
    if (!index.has(id)) {
      index.set(id, pos)
    }
  })
  return index
}
