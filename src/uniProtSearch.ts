import { jsonfetch } from './fetchUtils.ts'
import { isRecord } from './json.ts'
import {
  buildUniProtXrefQuery,
  isRecognizedDatabaseId,
  stripTrailingVersion,
} from './dbIds.ts'

import type { FetchOptions } from './fetchUtils.ts'

export interface UniProtEntry {
  accession: string
  id?: string
  geneName?: string
  organismName?: string
  proteinName?: string
  isReviewed: boolean
}

const UNIPROT_FIELDS =
  'accession,id,gene_names,organism_name,protein_name,reviewed'

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

const field = (value: unknown, key: string) =>
  isRecord(value) ? value[key] : undefined

/** One entry of UniProt's search answer, or undefined for one without an
 * accession, as a retired entry is listed. */
export function parseUniProtEntry(result: unknown): UniProtEntry | undefined {
  const accession = text(field(result, 'primaryAccession'))
  const genes = field(result, 'genes')
  const organism = field(result, 'organism')
  return accession
    ? {
        accession,
        id: text(field(result, 'uniProtkbId')),
        geneName: text(
          field(
            field(Array.isArray(genes) ? genes[0] : undefined, 'geneName'),
            'value',
          ),
        ),
        organismName:
          text(field(organism, 'commonName')) ??
          text(field(organism, 'scientificName')),
        proteinName: text(
          field(
            field(
              field(field(result, 'proteinDescription'), 'recommendedName'),
              'fullName',
            ),
            'value',
          ),
        ),
        isReviewed:
          field(result, 'entryType') === 'UniProtKB reviewed (Swiss-Prot)',
      }
    : undefined
}

async function searchUniProt(
  query: string,
  size: number,
  opts?: FetchOptions,
): Promise<UniProtEntry[]> {
  const url = `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(query)}&fields=${UNIPROT_FIELDS}&size=${size}`
  const results = field(await jsonfetch(url, opts), 'results')
  if (!Array.isArray(results)) {
    throw new Error(`rest.uniprot.org answered ${query} with no results list`)
  }
  return results.flatMap(result => {
    const entry = parseUniProtEntry(result)
    return entry ? [entry] : []
  })
}

/**
 * `gene_exact` rather than `gene`, which also matches synonyms and returns
 * paralogs. Without a taxon the query runs across every species, so a mouse
 * assembly whose tracks carry no taxId lists mouse beside human instead of
 * silently answering with the human entry.
 *
 * The symbol is quoted because a bare one containing `:` — an HLA allele, a
 * name straight out of an annotation file — reads as another field to
 * UniProt's parser, which answers 400.
 *
 * `organism_id` matches that taxon alone and `taxonomy_id` its descendants
 * too. See searchByGeneName for when each is asked.
 */
export function buildGeneNameQuery(
  geneName: string,
  organismId?: number,
  scope: 'organism_id' | 'taxonomy_id' = 'organism_id',
) {
  return [
    `gene_exact:"${geneName.replaceAll('"', '\\"')}"`,
    organismId ? `${scope}:${organismId}` : undefined,
    'reviewed:true',
  ]
    .filter(s => s !== undefined)
    .join(' AND ')
}

/**
 * The entries named by a UniProt entry name such as `HBA_HUMAN`, reviewed ones
 * first. An entry name is not a cross-reference to another database, so
 * `searchUniProtEntries` does not take it; this asks UniProt's `id` field. A
 * name can match a retired entry that UniProt lists without its fields, so an
 * entry is kept only if it carries an accession.
 */
export async function searchUniProtByEntryName(
  entryName: string,
  opts?: FetchOptions,
): Promise<UniProtEntry[]> {
  const entries = await searchUniProt(
    `id:${entryName.replaceAll(/[^A-Za-z0-9_]/g, '')}`,
    5,
    opts,
  )
  return entries.toSorted((a, b) => Number(b.isReviewed) - Number(a.isReviewed))
}

interface SearchAttempt {
  entries: UniProtEntry[]
  error: unknown
}

async function searchByXref(
  id: string,
  opts?: FetchOptions,
): Promise<SearchAttempt> {
  const query = buildUniProtXrefQuery(id)
  if (!query) {
    return { entries: [], error: undefined }
  }
  try {
    return { entries: await searchUniProt(query, 10, opts), error: undefined }
  } catch (e) {
    return { entries: [], error: e }
  }
}

async function searchByGeneName(
  geneName: string,
  organismId: number | undefined,
  opts?: FetchOptions,
): Promise<SearchAttempt> {
  try {
    const exact = await searchUniProt(
      buildGeneNameQuery(geneName, organismId),
      organismId ? 5 : 10,
      opts,
    )
    // Swiss-Prot files a microbe's entries under its reference strain, and an
    // assembly often names the species: fission yeast is 4896 and its entries
    // are 284812. The descendants are asked only on a miss, because for a
    // species with reviewed subspecies entries (human and Neanderthal) they
    // turn one answer into two.
    // When the descendant search fails, the taxon's own empty result stands
    // rather than becoming an error, unless the caller aborted it.
    const entries =
      exact.length === 0 && organismId
        ? await searchUniProt(
            buildGeneNameQuery(geneName, organismId, 'taxonomy_id'),
            5,
            opts,
          ).catch((e: unknown) => {
            if (opts?.signal?.aborted) {
              throw e
            }
            return exact
          })
        : exact
    return { entries, error: undefined }
  } catch (e) {
    return { entries: [], error: e }
  }
}

function deduplicateEntries(entries: UniProtEntry[]) {
  const seen = new Set<string>()
  const result: UniProtEntry[] = []
  for (const entry of entries) {
    if (!seen.has(entry.accession)) {
      seen.add(entry.accession)
      result.push(entry)
    }
  }
  return result
}

export interface UniProtSearchResult {
  entries: UniProtEntry[]
  attemptedCount: number
  failedCount: number
}

export async function searchUniProtEntries(
  {
    recognizedIds = [],
    geneId,
    geneName,
    organismId,
  }: {
    recognizedIds?: string[]
    geneId?: string
    geneName?: string
    /** NCBI taxon id; undefined searches every species */
    organismId?: number
  },
  opts?: FetchOptions,
): Promise<UniProtSearchResult> {
  const idsToSearch = new Set(recognizedIds)
  const strippedGeneId = geneId ? stripTrailingVersion(geneId) : undefined
  if (strippedGeneId && isRecognizedDatabaseId(strippedGeneId)) {
    idsToSearch.add(strippedGeneId)
  }

  // The gene-name query runs alongside the xrefs rather than after them: it is
  // only consulted when no xref found a reviewed entry, but waiting for that
  // answer before starting it doubled the latency of the commonest case.
  const [xrefResults, geneResult] = await Promise.all([
    Promise.all([...idsToSearch].map(id => searchByXref(id, opts))),
    geneName ? searchByGeneName(geneName, organismId, opts) : undefined,
  ])

  let entries = deduplicateEntries(xrefResults.flatMap(r => r.entries))
  // The gene-name answer is consulted only where no xref found a reviewed
  // entry. Counting it otherwise reported "failed for 1 of 2 identifiers" over
  // a gene that had in fact resolved, off a query nothing was waiting for.
  const consultedGeneResult =
    geneResult && !entries.some(e => e.isReviewed) ? geneResult : undefined
  if (consultedGeneResult) {
    entries = deduplicateEntries([...entries, ...consultedGeneResult.entries])
  }

  const attemptedCount = idsToSearch.size + (consultedGeneResult ? 1 : 0)
  const failedCount =
    xrefResults.filter(r => r.error !== undefined).length +
    (consultedGeneResult?.error === undefined ? 0 : 1)

  // Every attempt failing is a network problem, not an empty result. Throwing
  // it stops consumers reporting "No UniProt ID found" over a dead connection.
  if (
    entries.length === 0 &&
    attemptedCount > 0 &&
    attemptedCount === failedCount
  ) {
    throw (
      consultedGeneResult?.error ??
      xrefResults.find(r => r.error !== undefined)?.error
    )
  }

  return {
    entries: entries.toSorted(
      (a, b) => Number(b.isReviewed) - Number(a.isReviewed),
    ),
    attemptedCount,
    failedCount,
  }
}
