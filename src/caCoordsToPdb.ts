const AA_3LETTER: Record<string, string> = {
  A: 'ALA',
  C: 'CYS',
  D: 'ASP',
  E: 'GLU',
  F: 'PHE',
  G: 'GLY',
  H: 'HIS',
  I: 'ILE',
  K: 'LYS',
  L: 'LEU',
  M: 'MET',
  N: 'ASN',
  P: 'PRO',
  Q: 'GLN',
  R: 'ARG',
  S: 'SER',
  T: 'THR',
  V: 'VAL',
  W: 'TRP',
  Y: 'TYR',
  X: 'UNK',
}

function formatCoord(val: number) {
  return val.toFixed(3).padStart(8)
}

/**
 * A CA-only PDB file from a Foldseek hit's `tCa` (`x,y,z,x,y,z,…`) and `tSeq`,
 * its residues numbered from 1.
 */
export function caCoordsToPdb(
  tCa: string,
  tSeq: string,
  chainId = 'A',
  title?: string,
) {
  const coords = tCa.split(',').map(Number)
  const lines: string[] = []
  if (title) {
    lines.push(`TITLE     ${title}`)
  }
  lines.push('REMARK   1 Generated from Foldseek Cα coordinates')
  for (let i = 0; i + 2 < coords.length; i += 3) {
    const resNum = i / 3 + 1
    const resName = AA_3LETTER[tSeq[resNum - 1] ?? 'X'] ?? 'UNK'
    // columns: 7-11 serial, 13-16 name, 18-20 resName, 22 chainID,
    // 23-26 resSeq, 31-54 x y z, 55-60 occupancy, 61-66 tempFactor, 77-78 element
    lines.push(
      'ATOM  ' +
        String(resNum).padStart(5) +
        '  CA  ' +
        resName.padEnd(3) +
        ' ' +
        chainId +
        String(resNum).padStart(4) +
        '    ' +
        formatCoord(coords[i]!) +
        formatCoord(coords[i + 1]!) +
        formatCoord(coords[i + 2]!) +
        '  1.00  0.00           C',
    )
  }
  lines.push('END')
  return lines.join('\n')
}

/**
 * Whether a Foldseek hit carries tCa data that can be converted to PDB. A type
 * predicate rather than a boolean so a guarded caller can pass `hit.tCa`/
 * `hit.tSeq` straight to caCoordsToPdb without re-asserting they're defined.
 */
export function hasValidCaCoords<T extends { tCa?: string; tSeq?: string }>(
  hit: T,
): hit is T & { tCa: string; tSeq: string } {
  const { tCa, tSeq } = hit
  // Need at least 3 coordinates (x,y,z for one residue) and a sequence
  return !!tCa && !!tSeq && tCa.split(',').length >= 3
}
