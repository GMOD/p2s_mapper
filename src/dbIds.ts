// Single source of truth for database IDs that UniProt can cross-reference.
// Each entry carries everything downstream needs: the UniProt xref database
// keyword, the regex (Ensembl patterns cover human ENS, mouse ENSMUS, zebrafish
// ENSDAR, etc.), and a human-readable label. Recognition, label rendering, and
// xref-query building all derive from this list, so a new ID type is one entry.
type DbType = 'ensembl' | 'refseq' | 'ccds' | 'hgnc'

const DB_ID_PATTERNS: { db: DbType; pattern: RegExp; label: string }[] = [
  { db: 'ensembl', pattern: /^ENS[A-Z]*G\d+/i, label: 'Ensembl gene' },
  { db: 'ensembl', pattern: /^ENS[A-Z]*T\d+/i, label: 'Ensembl transcript' },
  { db: 'ensembl', pattern: /^ENS[A-Z]*P\d+/i, label: 'Ensembl protein' },
  { db: 'refseq', pattern: /^[NX]M_\d+/i, label: 'RefSeq mRNA' },
  { db: 'refseq', pattern: /^[NX]R_\d+/i, label: 'RefSeq ncRNA' },
  { db: 'refseq', pattern: /^[NX]P_\d+/i, label: 'RefSeq protein' },
  { db: 'ccds', pattern: /^CCDS\d+/i, label: 'CCDS' },
  { db: 'hgnc', pattern: /^HGNC:\d+/i, label: 'HGNC' },
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
    ? `xref:${match.db}-${match.db === 'hgnc' ? id.replace('HGNC:', '') : id}`
    : undefined
}

export function stripTrailingVersion(s?: string) {
  return s?.replace(/\.[^./]+$/, '')
}
