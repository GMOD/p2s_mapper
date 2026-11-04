import { structurePos, transcriptPos } from './coordinates.ts'
import { residueNumber } from './extractStructureSequences.ts'
import { codonGenomeSpan } from './genomeSpans.ts'

import type { CoordinateMapper } from './coordinates.ts'
import type { Entity } from './extractStructureSequences.ts'

/** What one structure's mapping to one transcript is built from. */
export interface ResidueMapping {
  /** the structure's mapped entity */
  entity: Entity | undefined
  /** the alignment of the transcript to that entity */
  mapper: CoordinateMapper | undefined
  /** the transcript's translation */
  transcript: string
  /** the transcript's genome mapping, from g2p_mapper's
   * genomeToTranscriptSeqMapping; absent for a structure with no genome */
  genome?: {
    refName: string
    g2p: Record<number, number>
    p2gCodon: Record<number, number[]>
  }
}

/**
 * One residue in each of the numberings a structure, a transcript and a genome
 * call it by. The structure fields are absent for a transcript residue the
 * structure lacks, the transcript fields for a structure residue the alignment
 * leaves unpaired, and the codon for a structure with no genome.
 */
export interface ResidueLocation {
  /** 0-based position in the entity's sequence */
  position?: number
  /** the number a paper and Mol*'s hover call it, `auth_seq_id` when the file
   * carries it; see residueNumber */
  residue?: number
  /** Mol*'s `label_seq_id`, how a selection addresses it */
  labelSeqId?: number
  /** chains of the entity, all of which hold this residue */
  chains?: readonly string[]
  structureLetter?: string
  /** 1-based residue of the transcript's translation */
  transcriptResidue?: number
  transcriptLetter?: string
  /** the codon's 0-based half-open genome span, outer bounds when an intron
   * splits it, on the transcript's own refName */
  codon?: { refName: string; start: number; end: number }
  /** the same codon as a 1-based locString */
  locus?: string
}

function transcriptFields(m: ResidueMapping, pos: number) {
  const span = m.genome ? codonGenomeSpan(m.genome.p2gCodon, pos) : undefined
  const refName = m.genome?.refName
  return {
    transcriptResidue: pos + 1,
    transcriptLetter: m.transcript[pos],
    ...(span && refName !== undefined
      ? {
          codon: { refName, start: span[0], end: span[1] },
          locus: `${refName}:${span[0] + 1}-${span[1]}`,
        }
      : {}),
  }
}

function structureFields(entity: Entity, pos: number) {
  return {
    position: pos,
    residue: residueNumber(entity, pos),
    labelSeqId: entity.seqIds[pos],
    chains: entity.chains,
    structureLetter: entity.seq[pos],
  }
}

/** A 0-based position of the mapped entity, located in every numbering;
 * undefined past the entity's end. */
export function locateStructureResidue(
  m: ResidueMapping,
  position: number,
): ResidueLocation | undefined {
  const { entity, mapper } = m
  if (!entity || position < 0 || position >= entity.seq.length) {
    return undefined
  }
  const pos = mapper?.structureToTranscript(structurePos(position))
  return {
    ...structureFields(entity, position),
    ...(pos === undefined ? {} : transcriptFields(m, pos)),
  }
}

/** A 0-based residue of the transcript's translation, located in every
 * numbering; undefined past the translation's end. */
export function locateTranscriptResidue(
  m: ResidueMapping,
  position: number,
): ResidueLocation | undefined {
  if (position < 0 || position >= m.transcript.length) {
    return undefined
  }
  const pos = m.mapper?.transcriptToStructure(transcriptPos(position))
  return {
    ...(pos === undefined || !m.entity ? {} : structureFields(m.entity, pos)),
    ...transcriptFields(m, position),
  }
}

/**
 * The residue whose codon holds a 0-based genome base on the transcript's
 * refName; undefined for a base outside the coding sequence. The caller
 * compares refNames, since only it knows the assembly's aliases.
 */
export function locateGenomeBase(
  m: ResidueMapping,
  base: number,
): ResidueLocation | undefined {
  const pos = m.genome?.g2p[base]
  return pos === undefined ? undefined : locateTranscriptResidue(m, pos)
}
