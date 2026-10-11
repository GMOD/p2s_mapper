// Structure URL builders and target parsers, with no dependencies.

const ALPHAFOLD_VERSION = 'v6'

// UniProt endpoints. rest.* is the machine API, serving the features as GFF
// and the sequence as FASTA; www.*/entry is the entry page for people.
export function uniprotGffUrl(uniprotId: string) {
  return `https://rest.uniprot.org/uniprotkb/${uniprotId}.gff`
}

export function uniprotFastaUrl(uniprotId: string) {
  return `https://rest.uniprot.org/uniprotkb/${uniprotId}.fasta`
}

export function uniprotEntryUrl(uniprotId: string) {
  return `https://www.uniprot.org/uniprotkb/${uniprotId}/entry`
}

/**
 * The guessed filename of an accession's canonical AlphaFold model. A guess:
 * the F1 fragment does not exist past the length cap and the version moves, so
 * this is the last resort when the prediction API cannot be reached. Ask
 * `fetchAlphaFoldModels` for the real files.
 */
export function getAlphaFoldStructureUrl(
  uniprotId: string,
  version = ALPHAFOLD_VERSION,
) {
  return `https://alphafold.ebi.ac.uk/files/AF-${uniprotId}-F1-model_${version}.cif`
}

export function getPdbStructureUrl(pdbId: string) {
  return `https://files.rcsb.org/download/${pdbId}.cif`
}

// A PDB id is four characters, the first a digit: 1TUP, 6ZIO. Checked before
// a typed one reaches a fetch, so three characters on the way to four are not
// a 404 apiece.
export function isPdbId(value: string) {
  return /^[1-9][A-Za-z0-9]{3}$/.test(value)
}

export function rcsbEntryUrl(pdbId: string) {
  return `https://www.rcsb.org/structure/${pdbId.toUpperCase()}`
}

/**
 * Resolve the `{ pdbId }` shorthand to a structure URL, so a hand-written config
 * or a short launch URL needs no RCSB filename. An explicit `url` (or inline
 * `data`) always wins, and resolving an already-resolved spec returns the same
 * url.
 *
 * `uniprotId` resolves to no url and still outranks a `pdbId`. AlphaFold DB's
 * files for an accession change (an isoform model, several fragments, a new
 * model version), so the caller keeps the accession and asks
 * `fetchAlphaFoldModels` which file to open.
 */
export function resolveStructureUrl({
  url,
  data,
  uniprotId,
  pdbId,
}: {
  url?: string
  data?: string
  uniprotId?: string
  pdbId?: string
}) {
  if (url !== undefined || data !== undefined) {
    return url
  }
  return uniprotId !== undefined || pdbId === undefined
    ? undefined
    : getPdbStructureUrl(pdbId)
}

// Hosts that serve the PDB archive, so a 4-character filename there really is
// that PDB entry. Restricted deliberately: a user-uploaded model happening to be
// named 1abc.cif must not pick up 1ABC's UniProt annotations.
const PDB_ARCHIVE_HOSTS = ['files.rcsb.org', 'www.ebi.ac.uk', 'ftp.ebi.ac.uk']

/**
 * The PDB id of a structure URL from the PDB archive, lowercased, or undefined
 * for any other URL. Accepts the filename forms those hosts serve, e.g.
 * `1TUP.cif`, `pdb1tup.ent.gz`, `1tup_updated.cif`.
 */
export function getPdbIdFromUrl(url: string) {
  const { host, file } = (() => {
    try {
      const parsed = new URL(url)
      return { host: parsed.hostname, file: parsed.pathname.split('/').pop() }
    } catch {
      return { host: undefined, file: undefined }
    }
  })()
  if (host === undefined || !PDB_ARCHIVE_HOSTS.includes(host)) {
    return undefined
  }
  const match =
    /^(?:pdb)?([1-9][a-z0-9]{3})(?:_updated)?\.(?:cif|bcif|pdb|ent)(?:\.gz)?$/i.exec(
      file ?? '',
    )
  return match?.[1]?.toLowerCase()
}

// Foldseek targets may contain a description after the ID separated by a
// space, e.g. "AF-P16442-F1-model_v6 Histo-blood group ABO transferase".
function extractTargetId(target: string) {
  return target.split(' ')[0]!
}

/** The accession of an AlphaFold model id or url, with its isoform suffix:
 * `AF-P16442-F1-model_v6` gives P16442, `AF-P04637-2-F1-model_v6` P04637-2. */
export function getUniprotIdFromAlphaFoldTarget(target: string) {
  const match = /AF-([A-Z0-9]+(?:-\d+)?)-F\d+/.exec(extractTargetId(target))
  return match?.[1]
}

// Foldseek names a pdb100 hit by the assembly file and chain it searched,
// `8f2h-assembly1.cif.gz_A`; the entry id is the first four characters.
export function getStructureUrlFromTarget(target: string, db: string) {
  const targetId = extractTargetId(target)
  if (targetId.startsWith('AF-')) {
    return `https://alphafold.ebi.ac.uk/files/${targetId}.cif`
  }
  const pdbId =
    db === 'pdb100'
      ? /^([1-9][a-z0-9]{3})(?:[-_.]|$)/i.exec(targetId)?.[1]
      : undefined
  return pdbId ? getPdbStructureUrl(pdbId) : undefined
}

export function getConfidenceUrlFromTarget(target: string) {
  const targetId = extractTargetId(target)
  if (targetId.startsWith('AF-')) {
    const confidenceId = targetId.replace('-model_', '-confidence_')
    return `https://alphafold.ebi.ac.uk/files/${confidenceId}.json`
  }
  return undefined
}

/**
 * The name to show for a structure: its PDB id, its AlphaFold accession, else
 * the file's name. Use it wherever a structure is named, so each place shows
 * the same name.
 */
export function structureDisplayLabel({
  url,
  data,
  uniprotId,
}: {
  url?: string
  data?: string
  uniprotId?: string
}) {
  if (url === undefined) {
    return data !== undefined
      ? 'Uploaded structure'
      : uniprotId
        ? `AlphaFold ${uniprotId}`
        : ''
  }
  const pdbId = getPdbIdFromUrl(url)
  if (pdbId) {
    return pdbId.toUpperCase()
  }
  const urlAccession = getUniprotIdFromAlphaFoldTarget(url)
  if (urlAccession) {
    return `AlphaFold ${urlAccession}`
  }
  const name = url.split('/').pop()?.split('?')[0]
  return name === undefined || name === '' ? url : name
}
