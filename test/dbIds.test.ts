import { describe, expect, it } from 'vitest'

import { buildUniProtXrefQuery, isRecognizedDatabaseId } from '../src/index.ts'

describe('RefSeq protein accessions', () => {
  it('recognises the proteins of one genome, organelle and viral included', () => {
    for (const id of [
      'NP_417179',
      'XP_011522345',
      'YP_009724389',
      'AP_000001',
    ]) {
      expect(buildUniProtXrefQuery(id)).toBe(`xref:refseq-${id}`)
    }
  })

  // one WP_ sequence is every strain's copy, so it names no single entry
  it('leaves out the non-redundant WP_ accessions', () => {
    expect(isRecognizedDatabaseId('WP_000135199')).toBe(false)
  })
})
