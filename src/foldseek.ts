// The Foldseek web server's search, from a browser or from node: predict the
// query's 3Di string, submit a `3diaa` search, poll the ticket, and read the
// hits. Each step is a function of its own, so a host can show the predicted
// structure before it spends a search, and `searchFoldseek` runs them in order.
// It sends the sequence to search.foldseek.com and 3di.foldseek.com and waits
// for their queue (about 8 s for a protein of 140 residues on a quiet day), so
// a caller offers it as an explicit action.

import { httpError, myfetch, rawfetch } from './fetchUtils.ts'

import type { FetchOptions } from './fetchUtils.ts'

/** the 3Di predictor takes at most this many residues */
export const FOLDSEEK_MAX_RESIDUES = 1200

export const FOLDSEEK_DATABASES = [
  { id: 'pdb100', label: 'PDB (100% redundancy)' },
  { id: 'afdb-swissprot', label: 'AlphaFold DB (Swiss-Prot)' },
  { id: 'afdb50', label: 'AlphaFold DB (50% redundancy)' },
  { id: 'afdb-proteome', label: 'AlphaFold DB (Proteomes)' },
  { id: 'cath50', label: 'CATH (50% redundancy)' },
  { id: 'mgnify_esm30', label: 'MGnify ESM30' },
  { id: 'bfmd', label: 'BFMD' },
  { id: 'gmgcl_id', label: 'GMGCL' },
] as const

export type FoldseekDatabaseId = (typeof FOLDSEEK_DATABASES)[number]['id']

export const DEFAULT_FOLDSEEK_DATABASES: FoldseekDatabaseId[] = [
  'pdb100',
  'afdb-swissprot',
]

/**
 * One alignment of the query to a target, as Foldseek writes it. Only `target`
 * is certain: a field the server leaves out stays undefined, so a caller that
 * needs positions asks `foldseekHitPairs`, which checks them.
 */
export interface FoldseekAlignment {
  /** the target's id followed by its description */
  target: string
  /** percent identity over the alignment */
  seqId?: number
  alnLength?: number
  mismatches?: number
  gapsopened?: number
  /** 1-based positions in the query sent and in the target's sequence */
  qStartPos?: number
  qEndPos?: number
  qLen?: number
  dbStartPos?: number
  dbEndPos?: number
  dbLen?: number
  /** the aligned query and target, `-` for a gap */
  qAln?: string
  dbAln?: string
  prob?: number
  eval?: number
  score?: number
  /** the target's CA coordinates as `x,y,z,x,y,z,…`, and its sequence */
  tCa?: string
  tSeq?: string
  taxId?: number
  taxName?: string
  query?: string
}

/** an alignment with the database it came from, as `searchFoldseek` lists them */
export interface FoldseekHit extends FoldseekAlignment {
  db: string
}

export interface FoldseekDatabaseResult {
  db: string
  /** one list of alignments per query; undefined when the database has none */
  alignments?: FoldseekAlignment[][]
}

export interface FoldseekResult {
  query: { header: string; sequence: string }
  results: FoldseekDatabaseResult[]
}

export interface FoldseekTicket {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'ERROR'
}

/** the query Foldseek can take from a sequence, and where it came from */
export interface FoldseekQuery {
  /** the twenty standard amino acids of the input, in order */
  sequence: string
  /** the 1-based residue of the input at each position of `sequence` */
  residueOf: number[]
}

const STANDARD = /[ACDEFGHIKLMNPQRSTVWY]/

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

/**
 * The residues of FASTA or plain text the predictor reads: header lines and
 * everything but the twenty standard amino acids dropped. The length limit
 * counts these, not the raw characters.
 */
export function cleanFoldseekSequence(text: string) {
  return text
    .split('\n')
    .filter(line => !line.startsWith('>'))
    .join('')
    .toUpperCase()
    .replaceAll(/[^ACDEFGHIKLMNPQRSTVWY]/g, '')
}

/** why a sequence cannot be searched, or undefined if it can */
export function foldseekLengthProblem(text: string) {
  const { length } = cleanFoldseekSequence(text)
  return length > FOLDSEEK_MAX_RESIDUES
    ? `Foldseek's 3Di predictor takes at most ${FOLDSEEK_MAX_RESIDUES.toLocaleString('en-US')} residues and this sequence has ${length.toLocaleString('en-US')}. Trim it to the region you want to search.`
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAlignmentRows(value: unknown): value is FoldseekAlignment[][] {
  return (
    Array.isArray(value) &&
    value.every(
      row =>
        Array.isArray(row) &&
        row.every(hit => isRecord(hit) && typeof hit.target === 'string'),
    )
  )
}

/**
 * The structured answer of `/api/result/<ticket>/0`: each database with its
 * alignments, one list per query. Alignments keep every field the server sent.
 */
export function parseFoldseekResponse(body: unknown): FoldseekResult {
  const results = isRecord(body) ? body.results : undefined
  if (!Array.isArray(results)) {
    throw new Error('Foldseek returned a result with no list of databases')
  }
  const queries = isRecord(body) ? body.queries : undefined
  const first: unknown = Array.isArray(queries) ? queries[0] : undefined
  const query =
    isRecord(first) &&
    typeof first.header === 'string' &&
    typeof first.sequence === 'string'
      ? { header: first.header, sequence: first.sequence }
      : { header: '', sequence: '' }
  return {
    query,
    results: results.map((result: unknown) => {
      if (!isRecord(result) || typeof result.db !== 'string') {
        throw new Error('Foldseek returned a result naming no database')
      }
      return {
        db: result.db,
        alignments: isAlignmentRows(result.alignments)
          ? result.alignments
          : undefined,
      }
    }),
  }
}

/** the alignments of the first query, every database together */
export function foldseekHits(result: FoldseekResult): FoldseekHit[] {
  return result.results.flatMap(({ db, alignments }) =>
    (alignments?.[0] ?? []).map(alignment => ({ ...alignment, db })),
  )
}

/** the hits of one query, from the body of `/api/result/<ticket>/0` */
export function parseFoldseekResult(body: unknown): FoldseekHit[] {
  return foldseekHits(parseFoldseekResponse(body))
}

/**
 * The residue pairs of a hit, as `[residue of the input, position in the
 * target]`, both 1-based. Undefined when the hit carries no alignment, or when
 * the alignment disagrees with its own start and end positions, which a
 * mapping must not be built from.
 *
 * A target position is a `label_seq_id` only where the structure drawn is built
 * from the same sequence: an AlphaFold F1 model is the UniProt sequence, but a
 * PDB chain's database sequence holds only residues with coordinates, so draw
 * that hit from its `tCa` with `caCoordsToPdb`, which numbers the same way.
 */
export function foldseekHitPairs(
  hit: FoldseekAlignment,
  query: FoldseekQuery,
): [number, number][] | undefined {
  const { qAln, dbAln, qStartPos, qEndPos, dbStartPos } = hit
  if (
    qAln === undefined ||
    dbAln === undefined ||
    qStartPos === undefined ||
    qEndPos === undefined ||
    dbStartPos === undefined
  ) {
    return undefined
  }
  const aligned = qAln.replaceAll('-', '').length
  if (aligned !== qEndPos - qStartPos + 1) {
    return undefined
  }
  const pairs: [number, number][] = []
  let q = qStartPos - 1
  let t = dbStartPos - 1
  for (let i = 0; i < qAln.length; i++) {
    const inQuery = qAln[i] !== '-'
    const inTarget = dbAln[i] !== '-'
    q += inQuery ? 1 : 0
    t += inTarget ? 1 : 0
    const residue = query.residueOf[q - 1]
    if (inQuery && inTarget && residue !== undefined) {
      pairs.push([residue, t])
    }
  }
  return pairs
}

const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' }

/**
 * The 3Di string of a sequence, from 3di.foldseek.com. `text` may be FASTA; the
 * returned `aaSequence` is what was sent, cleaned. Throws before any request
 * on a sequence over `FOLDSEEK_MAX_RESIDUES`.
 */
export async function predict3Di(text: string, opts?: FetchOptions) {
  const problem = foldseekLengthProblem(text)
  if (problem) {
    throw new Error(problem)
  }
  const aaSequence = cleanFoldseekSequence(text)
  const response = await myfetch(
    `https://3di.foldseek.com/predict/${encodeURIComponent(aaSequence)}`,
    opts,
  )
  const di3Sequence = (await response.text())
    .replace(/^["'/\s]+/, '')
    .replace(/["'/\s]+$/, '')
    .trim()
  return { aaSequence, di3Sequence }
}

/**
 * Submits a `3diaa` search of a sequence and its 3Di string, and returns the
 * ticket. The server answers a refusal (a rate limit, maintenance) as a 200
 * with no id, which this reports rather than returning a ticket nobody can poll.
 */
export async function submitFoldseekSearch(
  {
    aaSequence,
    di3Sequence,
    databases = DEFAULT_FOLDSEEK_DATABASES,
  }: {
    aaSequence: string
    di3Sequence: string
    databases?: readonly string[]
  },
  opts?: FetchOptions,
): Promise<FoldseekTicket> {
  const body = new URLSearchParams()
  body.append('q', `>query\n${aaSequence}\n>3DI\n${di3Sequence}\n`)
  body.append('mode', '3diaa')
  body.append('email', '')
  for (const db of databases) {
    body.append('database[]', db)
  }
  const url = 'https://search.foldseek.com/api/ticket'
  const response = await rawfetch(url, {
    ...opts,
    method: 'POST',
    headers: FORM,
    body,
  })
  if (!response.ok) {
    throw await httpError(response, url)
  }
  const text = await response.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = undefined
  }
  const { id, status } = isRecord(parsed) ? parsed : {}
  if (
    typeof id === 'string' &&
    (status === 'PENDING' ||
      status === 'RUNNING' ||
      status === 'COMPLETE' ||
      status === 'ERROR')
  ) {
    return { id, status }
  }
  throw new Error(`Foldseek did not accept the search: ${text.slice(0, 200)}`)
}

export interface FoldseekWaitOptions extends FetchOptions {
  /** told what the search is doing, for a progress line */
  onStatus?: (status: string) => void
  /** give up after this long, 180 s when unset */
  timeoutMs?: number
  /** wait this long between polls, 1 s when unset */
  pollMs?: number
}

/**
 * Polls a ticket until it completes and returns the structured result. Throws
 * on a failed search, on a refusal (a rate limit comes back as the ticket's
 * status), and when the time budget runs out. The caller's `signal` cancels it.
 */
export async function waitForFoldseekResults(
  ticketId: string,
  {
    onStatus,
    timeoutMs = 180_000,
    pollMs = 1000,
    ...opts
  }: FoldseekWaitOptions = {},
): Promise<FoldseekResult> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (opts.signal?.aborted) {
      throw new DOMException('The search was cancelled', 'AbortError')
    }
    const res = await myfetch('https://search.foldseek.com/api/tickets', {
      ...opts,
      method: 'POST',
      headers: FORM,
      body: new URLSearchParams({ 'tickets[]': ticketId }),
    })
    const body: unknown = await res.json()
    const first: unknown = Array.isArray(body) ? body[0] : undefined
    if (!isRecord(first) || typeof first.status !== 'string') {
      throw new Error('Foldseek returned no ticket status')
    }
    const state = first.status
    if (state === 'COMPLETE') {
      onStatus?.('Fetching results...')
      const result = await myfetch(
        `https://search.foldseek.com/api/result/${ticketId}/0`,
        opts,
      )
      return parseFoldseekResponse(await result.json())
    }
    // the server also answers RATELIMIT, MAINTENANCE and UNKNOWN, none of
    // which a wait resolves
    if (state !== 'PENDING' && state !== 'RUNNING') {
      throw new Error(
        `Foldseek search failed: ${typeof first.error === 'string' ? first.error : state}`,
      )
    }
    onStatus?.(
      `Search ${state.toLowerCase()}... (${Math.round((Date.now() - startedAt) / 1000)}s)`,
    )
    await new Promise(resolve => setTimeout(resolve, pollMs))
  }
  throw new Error(
    `Foldseek search timed out after ${Math.round(timeoutMs / 1000)}s`,
  )
}

export interface FoldseekSearchOptions extends FoldseekWaitOptions {
  /** database ids to search; PDB and AlphaFold DB Swiss-Prot when unset */
  databases?: readonly string[]
}

/**
 * Searches Foldseek with a sequence and returns the hits of every database:
 * predict the 3Di string, submit, wait. Throws on a sequence over
 * `FOLDSEEK_MAX_RESIDUES`, on a refusal, on a failed search, and when the time
 * budget runs out.
 */
export async function searchFoldseek(
  sequence: string,
  { databases, onStatus, ...wait }: FoldseekSearchOptions = {},
): Promise<FoldseekHit[]> {
  const { signal, fetch } = wait
  const fetchOpts = {
    ...(signal ? { signal } : {}),
    ...(fetch ? { fetch } : {}),
  }
  onStatus?.('Predicting 3Di')
  const { aaSequence, di3Sequence } = await predict3Di(sequence, fetchOpts)
  onStatus?.('Submitting the search')
  const ticket = await submitFoldseekSearch(
    { aaSequence, di3Sequence, databases },
    fetchOpts,
  )
  return foldseekHits(
    await waitForFoldseekResults(ticket.id, { ...wait, onStatus }),
  )
}
