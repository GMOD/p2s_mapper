/**
 * Drop the terminal stop codon(s) from a translated protein sequence.
 *
 * Only trailing `*` go: an interior stop (mis-annotated CDS, selenoprotein
 * read-through) occupies a real codon position, and deleting it would shift
 * every later residue out of step with g2p's codon-indexed transcript
 * coordinates — offsetting every genome↔structure hover past that point.
 */
export function stripStopCodon(seq: string) {
  return seq.replace(/\*+$/, '')
}

/**
 * Strip every stop codon, including interior ones. Only for sequences handed to
 * an external similarity search (Foldseek, AlphaFold), where `*` is not a valid
 * query character and no coordinate depends on the result's positions.
 */
export function stripAllStopCodons(seq: string) {
  return seq.replaceAll('*', '')
}

/**
 * Whether two translations are one protein, terminal stops aside. An exact
 * match maps every residue to itself and needs no alignment, so this is the
 * test for skipping the DP.
 */
export function sameProtein(a: string, b: string) {
  const protein = stripStopCodon(a)
  return protein.length > 0 && protein === stripStopCodon(b)
}
