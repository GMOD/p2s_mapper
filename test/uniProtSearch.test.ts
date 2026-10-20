import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildGeneNameQuery,
  searchUniProtByEntryName,
  searchUniProtEntries,
} from '../src/index.ts'

function reviewedEntry(accession: string, taxon: string) {
  return {
    entryType: 'UniProtKB reviewed (Swiss-Prot)',
    primaryAccession: accession,
    organism: { taxonId: 1, scientificName: taxon },
  }
}

function stubUniProt(
  handler: (url: string) => { ok: boolean; results?: unknown[] },
) {
  const calls: string[] = []
  vi.stubGlobal('fetch', (url: string) => {
    calls.push(url)
    const { ok, results = [] } = handler(url)
    return Promise.resolve(
      new Response(JSON.stringify({ results }), { status: ok ? 200 : 500 }),
    )
  })
  return calls
}

function queryOf(url: string) {
  return decodeURIComponent(new URL(url).searchParams.get('query') ?? '')
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('buildGeneNameQuery', () => {
  it('matches the symbol exactly rather than its synonyms', () => {
    expect(buildGeneNameQuery('Sox2', 10090)).toBe(
      'gene_exact:"Sox2" AND organism_id:10090 AND reviewed:true',
    )
  })

  it('quotes a symbol whose colon would read as another field', () => {
    // unquoted, UniProt's parser answers 400 for this one
    expect(buildGeneNameQuery('HLA-A:01')).toBe(
      'gene_exact:"HLA-A:01" AND reviewed:true',
    )
  })

  it('drops the organism filter when no taxon is known', () => {
    expect(buildGeneNameQuery('Sox2')).toBe(
      'gene_exact:"Sox2" AND reviewed:true',
    )
  })
})

describe('searchUniProtEntries', () => {
  it('searches every species when the assembly names no taxon', async () => {
    const calls = stubUniProt(() => ({
      ok: true,
      results: [reviewedEntry('P48432', 'Mus musculus')],
    }))

    const { entries } = await searchUniProtEntries({ geneName: 'Sox2' })

    expect(calls).toHaveLength(1)
    expect(queryOf(calls[0]!)).toBe('gene_exact:"Sox2" AND reviewed:true')
    expect(entries.map(e => e.accession)).toEqual(['P48432'])
  })

  it('scopes the query to a taxon when one is known', async () => {
    const calls = stubUniProt(() => ({ ok: true }))
    await searchUniProtEntries({ geneName: 'Sox2', organismId: 10090 })
    expect(queryOf(calls[0]!)).toContain('organism_id:10090')
  })

  // fission yeast: the assembly names the species, Swiss-Prot the strain
  it("asks the taxon's descendants when the taxon itself has no entry", async () => {
    const calls = stubUniProt(url => ({
      ok: true,
      results: queryOf(url).includes('taxonomy_id:4896')
        ? [reviewedEntry('P04551', 'Schizosaccharomyces pombe')]
        : [],
    }))
    const { entries } = await searchUniProtEntries({
      geneName: 'cdc2',
      organismId: 4896,
    })
    expect(entries.map(e => e.accession)).toEqual(['P04551'])
    expect(calls.map(queryOf)).toEqual([
      'gene_exact:"cdc2" AND organism_id:4896 AND reviewed:true',
      'gene_exact:"cdc2" AND taxonomy_id:4896 AND reviewed:true',
    ])
  })

  it('keeps the empty answer when the descendant search fails', async () => {
    stubUniProt(url => ({ ok: !queryOf(url).includes('taxonomy_id') }))
    const result = await searchUniProtEntries({
      geneName: 'cdc2',
      organismId: 4896,
    })
    expect(result).toEqual({ entries: [], attemptedCount: 1, failedCount: 0 })
  })

  it('rejects with the abort when the caller aborts the descendant search', async () => {
    const controller = new AbortController()
    const reason = new Error('dialog closed')
    vi.stubGlobal('fetch', (url: string) => {
      if (queryOf(url).includes('taxonomy_id')) {
        controller.abort(reason)
        return Promise.reject(reason)
      }
      return Promise.resolve(new Response(JSON.stringify({ results: [] })))
    })
    await expect(
      searchUniProtEntries(
        { geneName: 'cdc2', organismId: 4896 },
        { signal: controller.signal },
      ),
    ).rejects.toBe(reason)
  })

  it('does not ask the descendants when the taxon answers', async () => {
    const calls = stubUniProt(() => ({
      ok: true,
      results: [reviewedEntry('P04637', 'Homo sapiens')],
    }))
    await searchUniProtEntries({ geneName: 'TP53', organismId: 9606 })
    expect(calls).toHaveLength(1)
  })

  it('runs the gene-name query alongside the xrefs, not after them', async () => {
    let settleXref: () => void = () => undefined
    const xrefBlocked = new Promise<void>(resolve => {
      settleXref = resolve
    })
    const started: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      const query = queryOf(url)
      started.push(query)
      if (query.startsWith('xref:')) {
        await xrefBlocked
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    })

    const search = searchUniProtEntries({
      recognizedIds: ['ENST00000123'],
      geneName: 'TP53',
    })
    await Promise.resolve()
    expect(started).toHaveLength(2)
    settleXref()
    await search
  })

  it('counts the sources that failed so a partial outage can be reported', async () => {
    const logged = vi.spyOn(console, 'error')
    stubUniProt(url => ({
      ok: !queryOf(url).startsWith('xref:'),
      results: [reviewedEntry('P04637', 'Homo sapiens')],
    }))

    const result = await searchUniProtEntries({
      recognizedIds: ['ENST00000123'],
      geneName: 'TP53',
    })

    // the gene-name answer was consulted, the xref having found nothing
    expect(result.attemptedCount).toBe(2)
    expect(result.failedCount).toBe(1)
    expect(result.entries.map(e => e.accession)).toEqual(['P04637'])
    expect(logged).not.toHaveBeenCalled()
  })

  it('does not count a gene-name failure nothing was waiting for', async () => {
    stubUniProt(url => ({
      ok: queryOf(url).startsWith('xref:'),
      results: [reviewedEntry('P04637', 'Homo sapiens')],
    }))

    const result = await searchUniProtEntries({
      recognizedIds: ['ENST00000123'],
      geneName: 'TP53',
    })

    // the xref resolved a reviewed entry, so the gene-name answer went unread
    expect(result.attemptedCount).toBe(1)
    expect(result.failedCount).toBe(0)
  })

  it('throws when every source failed rather than reporting no entries', async () => {
    stubUniProt(() => ({ ok: false }))
    await expect(
      searchUniProtEntries({ recognizedIds: ['ENST00000123'] }),
    ).rejects.toThrow(/rest\.uniprot\.org/)
  })
})

describe('searchUniProtByEntryName', () => {
  it('asks the id field and lists reviewed entries first', async () => {
    const calls = stubUniProt(() => ({
      ok: true,
      results: [
        {
          entryType: 'UniProtKB unreviewed (TrEMBL)',
          primaryAccession: 'D1MGQ2',
        },
        reviewedEntry('P69905', 'Homo sapiens'),
      ],
    }))
    const entries = await searchUniProtByEntryName('HBA_HUMAN')
    expect(queryOf(calls[0]!)).toBe('id:HBA_HUMAN')
    expect(entries.map(e => [e.accession, e.isReviewed])).toEqual([
      ['P69905', true],
      ['D1MGQ2', false],
    ])
  })

  it('keeps only the characters an entry name has, so it cannot add a field', async () => {
    const calls = stubUniProt(() => ({ ok: true }))
    await searchUniProtByEntryName('HBA_HUMAN OR reviewed:false')
    expect(queryOf(calls[0]!)).toBe('id:HBA_HUMANORreviewedfalse')
  })
})
