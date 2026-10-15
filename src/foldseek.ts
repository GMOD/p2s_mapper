// The Foldseek web server's search, from a browser or from node: predict the
// query's 3Di string, submit an `3diaa` search, poll the ticket, and read the
// hits. It sends the sequence to search.foldseek.com and 3di.foldseek.com and
// waits for their queue (about 8 s for a protein of 140 residues on a quiet
// day), so a caller offers it as an explicit action.

import { httpError, myfetch, rawfetch } from './fetchUtils.ts'

import type { FetchOptions } from './fetchUtils.ts'

/** the 3Di predictor takes at most this many residues */
export const FOLDSEEK_MAX_RESIDUES = 1200

export const FOLDSEEK_DATABASES = [
  { id: 'pdb100', label: 'PDB' },
  { id: 'afdb-swissprot', label: 'AlphaFold DB, Swiss-Prot' },
  { id: 'afdb50', label: 'AlphaFold DB, 50% clusters' },
  { id: 'afdb-proteome', label: 'AlphaFold DB, proteomes' },
  { id: 'cath50', label: 'CATH' },
] as const

export const DEFAULT_FOLDSEEK_DATABASES = ['pdb100', 'afdb-swissprot']

const STANDARD = /[ACDEFGHIKLMNPQRSTVWY]/

export interface FoldseekHit {
  /** the database the hit came from, such as `pdb100` */
  db: string
  /** the target's id followed by its description, as Foldseek names it */
  target: string
  /** percent identity over the alignment */
  seqId?: number
  eval?: number
  /** 1-based positions in the query sent and in the target's sequence */
  qStartPos: number
  qEndPos: number
  dbStartPos: number
  dbEndPos: number
  /** the aligned query and target, `-` for a gap */
  qAln: string
  dbAln: string
  /** the target's CA coordinates as `x,y,z,x,y,z,…`, and its sequence */
  tCa?: string
  tSeq?: string
  taxName?: string
}

/** the query Foldseek can take from a sequence, and where it came from */
export interface FoldseekQuery {
  /** the twenty standard amino acids of the input, in order */
  sequence: string
  /** the 1-based residue of the input at each position of `sequence` */
  residueOf: number[]
}

/**
 * The query Foldseek can take from a possibly gapped sequence. A residue the
 * 3Di predictor cannot read, such as X, U or B, is left out, so a hit's
 * positions need `residueOf` to get back to the input's own numbering.
 */
export function foldseekQuery(sequence: string): FoldseekQuery {
  let residue = 0
  let kept = ''
  const residueOf: number[] = []
  for (const letter of sequence.toUpperCase()) {
    if (letter === '-' || letter === '.') {
      continue
    }
    residue++
    if (STANDARD.test(letter)) {
      kept += letter
      residueOf.push(residue)
    }
  }
  return { sequence: kept, residueOf }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function numberOf(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseHit(db: string, raw: unknown): FoldseekHit | undefined {
  if (!isRecord(raw) || typeof raw.target !== 'string') {
    return undefined
  }
  const qStartPos = numberOf(raw.qStartPos)
  const qEndPos = numberOf(raw.qEndPos)
  const dbStartPos = numberOf(raw.dbStartPos)
  const dbEndPos = numberOf(raw.dbEndPos)
  if (
    qStartPos === undefined ||
    qEndPos === undefined ||
    dbStartPos === undefined ||
    dbEndPos === undefined ||
    typeof raw.qAln !== 'string' ||
    typeof raw.dbAln !== 'string'
  ) {
    return undefined
  }
  return {
    db,
    target: raw.target,
    seqId: numberOf(raw.seqId),
    eval: numberOf(raw.eval),
    qStartPos,
    qEndPos,
    dbStartPos,
    dbEndPos,
    qAln: raw.qAln,
    dbAln: raw.dbAln,
    tCa: typeof raw.tCa === 'string' ? raw.tCa : undefined,
    tSeq: typeof raw.tSeq === 'string' ? raw.tSeq : undefined,
    taxName: typeof raw.taxName === 'string' ? raw.taxName : undefined,
  }
}

/**
 * The hits of one query, from the body of `/api/result/<ticket>/0`, all
 * databases together. A hit missing a field the mapping needs is dropped.
 */
export function parseFoldseekResult(body: unknown): FoldseekHit[] {
  const results = isRecord(body) ? body.results : undefined
  if (!Array.isArray(results)) {
    throw new Error('Foldseek returned a result with no list of databases')
  }
  return results.flatMap(result => {
    if (!isRecord(result) || typeof result.db !== 'string') {
      return []
    }
    const rows = Array.isArray(result.alignments) ? result.alignments : []
    const first: unknown = rows[0]
    return (Array.isArray(first) ? first : []).flatMap(raw => {
      const hit = parseHit(result.db as string, raw)
      return hit ? [hit] : []
    })
  })
}

/**
 * The residue pairs of a hit, as `[residue of the input, position in the
 * target]`, both 1-based. Undefined when the hit's alignment disagrees with its
 * own start and end positions, which a mapping must not be built from.
 *
 * A target position is a `label_seq_id` only where the structure drawn is built
 * from the same sequence: an AlphaFold F1 model is the UniProt sequence, but a
 * PDB chain's database sequence holds only residues with coordinates, so draw
 * that hit from its `tCa` with `caCoordsToPdb`, which numbers the same way.
 */
export function foldseekHitPairs(
  hit: FoldseekHit,
  query: FoldseekQuery,
): [number, number][] | undefined {
  const aligned = hit.qAln.replaceAll('-', '').length
  if (aligned !== hit.qEndPos - hit.qStartPos + 1) {
    return undefined
  }
  const pairs: [number, number][] = []
  let q = hit.qStartPos - 1
  let t = hit.dbStartPos - 1
  for (let i = 0; i < hit.qAln.length; i++) {
    const inQuery = hit.qAln[i] !== '-'
    const inTarget = hit.dbAln[i] !== '-'
    q += inQuery ? 1 : 0
    t += inTarget ? 1 : 0
    const residue = query.residueOf[q - 1]
    if (inQuery && inTarget && residue !== undefined) {
      pairs.push([residue, t])
    }
  }
  return pairs
}

export interface FoldseekSearchOptions extends FetchOptions {
  /** database ids to search; PDB and AlphaFold DB Swiss-Prot when unset */
  databases?: string[]
  /** told what the search is doing, for a progress line */
  onStatus?: (status: string) => void
  /** give up after this long, 180 s when unset */
  timeoutMs?: number
  /** wait this long between polls, 1 s when unset */
  pollMs?: number
}

const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' }

function recordOf(value: unknown) {
  return isRecord(value) ? value : {}
}

/**
 * Searches Foldseek with a sequence and returns the hits of every database.
 * Throws on a sequence over `FOLDSEEK_MAX_RESIDUES`, on a refusal (the server
 * answers a rate limit or maintenance as a 200 with no ticket), on a failed
 * search, and when the time budget runs out. The caller's `signal` cancels it.
 */
export async function searchFoldseek(
  sequence: string,
  {
    databases = DEFAULT_FOLDSEEK_DATABASES,
    onStatus,
    timeoutMs = 180_000,
    pollMs = 1000,
    ...opts
  }: FoldseekSearchOptions = {},
): Promise<FoldseekHit[]> {
  if (sequence.length > FOLDSEEK_MAX_RESIDUES) {
    throw new Error(
      `Foldseek's 3Di predictor takes at most ${FOLDSEEK_MAX_RESIDUES} residues and this sequence has ${sequence.length}. Trim it to the region you want to search.`,
    )
  }
  onStatus?.('Predicting 3Di')
  const di = await myfetch(
    `https://3di.foldseek.com/predict/${encodeURIComponent(sequence)}`,
    opts,
  )
  const di3 = (await di.text()).replaceAll(/["'\s/]/g, '')

  const body = new URLSearchParams()
  body.append('q', `>query\n${sequence}\n>3DI\n${di3}\n`)
  body.append('mode', '3diaa')
  body.append('email', '')
  for (const db of databases) {
    body.append('database[]', db)
  }
  onStatus?.('Submitting the search')
  const ticketUrl = 'https://search.foldseek.com/api/ticket'
  const ticketResponse = await rawfetch(ticketUrl, {
    ...opts,
    method: 'POST',
    headers: FORM,
    body,
  })
  if (!ticketResponse.ok) {
    throw await httpError(ticketResponse, ticketUrl)
  }
  const text = await ticketResponse.text()
  let ticket: unknown
  try {
    ticket = JSON.parse(text)
  } catch {
    ticket = undefined
  }
  const id = recordOf(ticket).id
  if (typeof id !== 'string') {
    throw new Error(`Foldseek did not accept the search: ${text.slice(0, 200)}`)
  }

  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (opts.signal?.aborted) {
      throw new DOMException('The search was cancelled', 'AbortError')
    }
    const res = await myfetch('https://search.foldseek.com/api/tickets', {
      ...opts,
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ 'tickets[]': id }),
    })
    const first: unknown = ((await res.json()) as unknown[])[0]
    const status = recordOf(first)
    const state = typeof status.status === 'string' ? status.status : 'UNKNOWN'
    if (state === 'COMPLETE') {
      onStatus?.('Reading the hits')
      const result = await myfetch(
        `https://search.foldseek.com/api/result/${id}/0`,
        opts,
      )
      return parseFoldseekResult(await result.json())
    }
    if (state !== 'PENDING' && state !== 'RUNNING') {
      throw new Error(
        `Foldseek search failed: ${typeof status.error === 'string' ? status.error : state}`,
      )
    }
    onStatus?.(
      `Searching (${Math.round((Date.now() - startedAt) / 1000)} s, ${state.toLowerCase()})`,
    )
    await new Promise(resolve => setTimeout(resolve, pollMs))
  }
  throw new Error(
    `Foldseek search timed out after ${Math.round(timeoutMs / 1000)} s`,
  )
}
