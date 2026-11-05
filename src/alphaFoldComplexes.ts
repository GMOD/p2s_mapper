import { httpError, rawfetch } from './fetchUtils.ts'
import { finiteNumber, isRecord, strings } from './json.ts'

import type { FetchOptions } from './fetchUtils.ts'

/** One protein of a predicted complex */
export interface AlphaFoldComplexMember {
  accession: string
  gene?: string
  /** UniProt's protein name, e.g. "Glutathione S-transferase P" */
  description?: string
  /** how many copies of it the complex holds */
  copies: number
}

/** A complex AlphaFold DB predicted, as its complex API lists it */
export interface AlphaFoldComplex {
  /** AlphaFold DB's id for the model, e.g. AF-0000000066211449 */
  entity: string
  /** one protein in several copies, rather than several proteins */
  homomer: boolean
  /** "dimer", "trimer", ... */
  oligomericState?: string
  /** AlphaFold DB's name, e.g. "Homodimer of Superoxide dismutase" */
  name?: string
  members: AlphaFoldComplexMember[]
  /** mean per-residue confidence (pLDDT), 0-100 */
  meanPlddt?: number
  /** interface predicted TM-score, 0-1: how sure the model is of how the
   * chains sit against each other */
  iptm?: number
  ipsae?: number
  pdockq?: number
  pdockq2?: number
  lis?: number
}

/** One chain of a complex model */
export interface AlphaFoldComplexChain {
  /** author chain id in the model file */
  chainId: string
  accession: string
  gene?: string
  description?: string
  sequence: string
}

/** The files of one complex model, and which protein each chain is */
export interface AlphaFoldComplexModel {
  entity: string
  url: string
  confidenceUrl?: string
  paeUrl?: string
  chains: AlphaFoldComplexChain[]
}

const ALPHAFOLD_API = 'https://alphafold.ebi.ac.uk/api'

function text(value: unknown) {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function members(entry: Record<string, unknown>) {
  const accessions = strings(entry.uniprotAccession)
  const genes = Array.isArray(entry.gene) ? entry.gene : []
  const descriptions = Array.isArray(entry.uniprotDescription)
    ? entry.uniprotDescription
    : []
  const composition = Array.isArray(entry.complexComposition)
    ? entry.complexComposition.filter(isRecord)
    : []
  return composition.flatMap(c => {
    const accession = text(c.identifier)
    const i = accession === undefined ? -1 : accessions.indexOf(accession)
    return accession === undefined
      ? []
      : [
          {
            accession,
            gene: text(genes[i]),
            description: text(descriptions[i]),
            copies: finiteNumber(c.stoichiometry) ?? 1,
          },
        ]
  })
}

/**
 * Reads AlphaFold DB's complex API, skipping any entry without a model id or
 * a composition. A protein's name and gene come in arrays parallel to
 * `uniprotAccession`, not in the composition, so they are joined here.
 */
export function parseAlphaFoldComplexes(json: unknown): AlphaFoldComplex[] {
  return (Array.isArray(json) ? json : []).filter(isRecord).flatMap(e => {
    const entity = text(e.modelEntityId)
    const m = members(e)
    return entity === undefined || m.length === 0
      ? []
      : [
          {
            entity,
            homomer: m.length === 1,
            oligomericState: text(e.oligomericState),
            name: text(e.complexName),
            members: m,
            meanPlddt: finiteNumber(e.globalMetricValue),
            iptm: finiteNumber(e.complexPredictionAccuracy_ipTM),
            ipsae: finiteNumber(e.complexPredictionAccuracy_ipSAE),
            pdockq: finiteNumber(e.complexPredictionAccuracy_pDockQ),
            pdockq2: finiteNumber(e.complexPredictionAccuracy_pDockQ2),
            lis: finiteNumber(e.complexPredictionAccuracy_LIS),
          },
        ]
  })
}

/**
 * Every complex AlphaFold DB has predicted with the protein in it: its
 * homomers and its complexes with other proteins. The list names no files;
 * ask `fetchAlphaFoldComplexModel` for the one to open. An accession in no
 * complex answers 404, which is no complexes rather than an error.
 */
export async function fetchAlphaFoldComplexes(
  uniprotId: string,
  opts?: FetchOptions,
) {
  const url = `${ALPHAFOLD_API}/complex/${encodeURIComponent(uniprotId)}`
  const res = await rawfetch(url, opts)
  if (res.status === 400 || res.status === 404) {
    return []
  }
  if (!res.ok) {
    throw await httpError(res, url)
  }
  return parseAlphaFoldComplexes(await res.json())
}

/**
 * Reads the prediction API's answer for a complex's model id: one row per
 * chain, each carrying the same files. Undefined when no row names a file.
 */
export function parseAlphaFoldComplexModel(
  json: unknown,
): AlphaFoldComplexModel | undefined {
  const rows = (Array.isArray(json) ? json : []).filter(isRecord)
  const first = rows.find(r => text(r.cifUrl) !== undefined)
  const entity = text(first?.modelEntityId)
  const url = text(first?.cifUrl)
  return first && entity && url
    ? {
        entity,
        url,
        confidenceUrl: text(first.plddtDocUrl),
        paeUrl: text(first.paeDocUrl),
        chains: rows.flatMap(r => {
          const chainId = text(r.chainId)
          const accession = text(r.uniprotAccession)
          const sequence = text(r.sequence)
          return chainId && accession && sequence
            ? [
                {
                  chainId,
                  accession,
                  gene: text(r.gene),
                  description: text(r.uniprotDescription),
                  sequence,
                },
              ]
            : []
        }),
      }
    : undefined
}

/**
 * The files of a complex model and the protein each chain is, by its model id.
 * Asked rather than spelled from the id, because the file name carries a model
 * version that moves. Undefined when AlphaFold DB has no such model.
 */
export async function fetchAlphaFoldComplexModel(
  entity: string,
  opts?: FetchOptions,
) {
  const url = `${ALPHAFOLD_API}/prediction/${encodeURIComponent(entity)}`
  const res = await rawfetch(url, opts)
  if (res.status === 400 || res.status === 404) {
    return undefined
  }
  if (!res.ok) {
    throw await httpError(res, url)
  }
  return parseAlphaFoldComplexModel(await res.json())
}
