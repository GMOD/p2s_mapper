export interface ResidueHierarchy {
  residueAtomSegments: { offsets: ArrayLike<number>; count: number }
  chainAtomSegments: { index: ArrayLike<number> }
  chains: { label_entity_id: { value(row: number): string } }
  residues: { label_seq_id: { value(row: number): number } }
}

/**
 * A value per observed residue, grouped by entity and keyed by label_seq_id.
 * The first residue with an id wins, so a homodimer's copies and a
 * micro-heterogeneous site each give one value.
 */
export function valuesByEntityAndLabelSeqId(
  hierarchy: ResidueHierarchy,
  valueOf: (residue: number, firstAtom: number) => number,
) {
  const { residueAtomSegments, chainAtomSegments, chains, residues } = hierarchy
  const byEntity = new Map<string, Map<number, number>>()
  for (let residue = 0; residue < residueAtomSegments.count; residue++) {
    const atom = residueAtomSegments.offsets[residue]!
    const entityId = chains.label_entity_id.value(
      chainAtomSegments.index[atom]!,
    )
    let values = byEntity.get(entityId)
    if (!values) {
      values = new Map()
      byEntity.set(entityId, values)
    }
    const labelSeqId = residues.label_seq_id.value(residue)
    if (!values.has(labelSeqId)) {
      values.set(labelSeqId, valueOf(residue, atom))
    }
  }
  return byEntity
}
