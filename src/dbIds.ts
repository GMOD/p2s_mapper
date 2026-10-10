// Single source of truth for database IDs that UniProt can cross-reference.
// Each entry carries everything downstream needs: the UniProt xref database
// keyword, the regex (Ensembl patterns cover human ENS, mouse ENSMUS, zebrafish
// ENSDAR, etc.), and a human-readable label. Recognition, label rendering, and
// xref-query building all derive from this list, so a new ID type is one entry.
type DbType = 'ensembl' | 'refseq' | 'ccds' | 'hgnc' | 'geneid'

const DB_ID_PATTERNS: { db: DbType; pattern: RegExp; label: string }[] = [
  { db: 'ensembl', pattern: /^ENS[A-Z]*G\d+/i, label: 'Ensembl gene' },
  { db: 'ensembl', pattern: /^ENS[A-Z]*T\d+/i, label: 'Ensembl transcript' },
  { db: 'ensembl', pattern: /^ENS[A-Z]*P\d+/i, label: 'Ensembl protein' },
  { db: 'refseq', pattern: /^[NX]M_\d+/i, label: 'RefSeq mRNA' },
  { db: 'refseq', pattern: /^[NX]R_\d+/i, label: 'RefSeq ncRNA' },
  // YP_ and AP_ are the proteins of organelle, viral and prokaryotic genomes.
  // WP_ is left out on purpose: it names one sequence shared by every strain
  // and species that encodes it, so its cross-references are a list of
  // organisms rather than an entry (E. coli's WP_000135199 has six reviewed).
  { db: 'refseq', pattern: /^[NXYA]P_\d+/i, label: 'RefSeq protein' },
  { db: 'ccds', pattern: /^CCDS\d+/i, label: 'CCDS' },
  { db: 'hgnc', pattern: /^HGNC:\d+/i, label: 'HGNC' },
  // NCBI's GFFs carry `Dbxref=GeneID:7157`, and UniProt keeps the GeneID
  // cross-reference for every organism NCBI annotates, where a symbol search
  // needs a taxon and misses a TrEMBL-only gene.
  { db: 'geneid', pattern: /^GeneID:\d+$/i, label: 'NCBI Gene' },
]

export function matchDbIdPattern(id: string) {
  return DB_ID_PATTERNS.find(p => p.pattern.test(id))
}

/** Whether an ID is a database identifier UniProt can map. */
export function isRecognizedDatabaseId(id: string) {
  return matchDbIdPattern(id) !== undefined
}

/** Human-readable label for an ID, e.g. "ENST00000123 (Ensembl transcript)".
 * Unrecognized IDs are returned unadorned. */
export function getDbIdLabel(id: string) {
  const match = matchDbIdPattern(id)
  return match ? `${id} (${match.label})` : id
}

/** The UniProt xref query fragment for a recognized ID, e.g.
 * "xref:ensembl-ENST00000123". HGNC strips its redundant "HGNC:" prefix. */
export function buildUniProtXrefQuery(id: string) {
  const match = matchDbIdPattern(id)
  return match
    ? `xref:${match.db}-${match.db === 'hgnc' || match.db === 'geneid' ? id.replace(/^[^:]+:/, '') : id}`
    : undefined
}

export function stripTrailingVersion(s?: string) {
  return s?.replace(/\.[^./]+$/, '')
}
