import { describe, expect, it } from 'vitest'

import {
  FOLDSEEK_MAX_RESIDUES,
  foldseekHitPairs,
  foldseekQuery,
  parseFoldseekResult,
  searchFoldseek,
} from '../src/index.ts'

import type { FoldseekHit } from '../src/index.ts'

const hit = (over: Partial<FoldseekHit> = {}): FoldseekHit => ({
  db: 'afdb-swissprot',
  target: 'AF-P69907-F1-model_v6 Hemoglobin subunit alpha',
  seqId: 100,
  eval: 1e-18,
  qStartPos: 1,
  qEndPos: 4,
  dbStartPos: 2,
  dbEndPos: 6,
  qAln: 'AC-DE',
  dbAln: 'ACGDE',
  ...over,
})

describe('foldseekQuery', () => {
  it('keeps the standard residues and records where each came from', () => {
    expect(foldseekQuery('MK-XA.UV')).toEqual({
      sequence: 'MKAV',
      // X and U are residues 3 and 5 of the ungapped input MKXAUV
      residueOf: [1, 2, 4, 6],
    })
  })

  it('upper-cases a lower-case sequence', () => {
    expect(foldseekQuery('mka').sequence).toBe('MKA')
  })
})

describe('foldseekHitPairs', () => {
  it('numbers the target by position and the input by its own residues', () => {
    const query = foldseekQuery('ACDE')
    // A,C then a gap then D,E on target 2,3,(4 skipped),5,6
    expect(foldseekHitPairs(hit(), query)).toEqual([
      [1, 2],
      [2, 3],
      [3, 5],
      [4, 6],
    ])
  })

  it('maps back through the residues the query left out', () => {
    const query = foldseekQuery('AXCDE')
    expect(
      foldseekHitPairs(
        hit({ qAln: 'ACDE', dbAln: 'ACDE', dbEndPos: 5 }),
        query,
      ),
    ).toEqual([
      [1, 2],
      [3, 3],
      [4, 4],
      [5, 5],
    ])
  })

  it('refuses a hit whose alignment disagrees with its own positions', () => {
    expect(
      foldseekHitPairs(hit({ qEndPos: 9 }), foldseekQuery('ACDE')),
    ).toBeUndefined()
  })
})

describe('parseFoldseekResult', () => {
  it('reads the hits of every database and drops a hit missing a field', () => {
    const body = {
      results: [
        {
          db: 'pdb100',
          alignments: [
            [
              {
                target: '1c7c-assembly1.cif.gz_A',
                seqId: 98.5,
                qStartPos: 1,
                qEndPos: 5,
                dbStartPos: 3,
                dbEndPos: 7,
                qAln: 'ACDEF',
                dbAln: 'ACDEF',
              },
              { target: 'no-positions' },
            ],
          ],
        },
      ],
    }
    const hits = parseFoldseekResult(body)
    expect(hits.map(h => [h.db, h.target])).toEqual([
      ['pdb100', '1c7c-assembly1.cif.gz_A'],
    ])
  })

  it('throws on a body with no list of databases', () => {
    expect(() => parseFoldseekResult({})).toThrow('no list of databases')
  })
})

describe('searchFoldseek', () => {
  function server(states: string[], log: string[] = []) {
    let poll = 0
    const fetch = ((input: string, init?: RequestInit) => {
      log.push(`${init?.method ?? 'GET'} ${input.slice(0, 60)}`)
      if (input.startsWith('https://3di.foldseek.com/predict/')) {
        return Promise.resolve(new Response('"DDPVV"'))
      }
      if (input.endsWith('/api/ticket')) {
        const body =
          init?.body instanceof URLSearchParams ? init.body.toString() : ''
        expect(body).toContain('mode=3diaa')
        expect(decodeURIComponent(body)).toContain('>3DI\nDDPVV')
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'T1', status: 'PENDING' })),
        )
      }
      if (input.endsWith('/api/tickets')) {
        const status = states[Math.min(poll++, states.length - 1)]
        return Promise.resolve(new Response(JSON.stringify([{ status }])))
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            results: [{ db: 'pdb100', alignments: [[hit({ db: 'pdb100' })]] }],
          }),
        ),
      )
    }) as typeof globalThis.fetch
    return fetch
  }

  it('predicts, submits, polls until complete and reads the hits', async () => {
    const log: string[] = []
    const status: string[] = []
    const hits = await searchFoldseek('ACDEF', {
      fetch: server(['PENDING', 'RUNNING', 'COMPLETE'], log),
      onStatus: s => status.push(s),
      pollMs: 1,
    })
    expect(hits.map(h => h.db)).toEqual(['pdb100'])
    expect(log.at(-1)).toContain('/api/result/T1/0')
    expect(status[0]).toBe('Predicting 3Di')
    expect(status.some(s => s.startsWith('Searching'))).toBe(true)
  })

  it('reports a refusal that arrives as a 200 with no ticket', async () => {
    const fetch = ((input: string) =>
      Promise.resolve(
        new Response(
          input.includes('3di.')
            ? '"DD"'
            : JSON.stringify({ status: 'RATELIMIT' }),
        ),
      )) as typeof globalThis.fetch
    await expect(searchFoldseek('ACDEF', { fetch })).rejects.toThrow(
      'did not accept the search',
    )
  })

  it('stops on a failed search with the server error', async () => {
    await expect(
      searchFoldseek('ACDEF', { fetch: server(['ERROR']), pollMs: 1 }),
    ).rejects.toThrow('Foldseek search failed')
  })

  it('gives up after the time budget', async () => {
    await expect(
      searchFoldseek('ACDEF', {
        fetch: server(['PENDING']),
        timeoutMs: 20,
        pollMs: 5,
      }),
    ).rejects.toThrow('timed out')
  })

  it('refuses a sequence over the predictor limit before any request', async () => {
    const fetch = (() => {
      throw new Error('no request expected')
    }) as unknown as typeof globalThis.fetch
    await expect(
      searchFoldseek('A'.repeat(FOLDSEEK_MAX_RESIDUES + 1), { fetch }),
    ).rejects.toThrow('takes at most')
  })
})
