import { describe, expect, it } from 'vitest'
import { parseDatamatrix, parseLocationQr } from '../gs1'

describe('parseDatamatrix', () => {
  it('parses a full GS1 content', () => {
    const ref = parseDatamatrix('(01)20000000012346(10)BATCH-2026A(15)281001(21)000991')
    expect(ref.nomenclatureCode).toBe('20000000012346')
    expect(ref.batchNumber).toBe('BATCH-2026A')
    expect(ref.expiryDate).toBe('281001')
    expect(ref.packageId).toBe(991)
  })

  it('handles missing optional parts', () => {
    const ref = parseDatamatrix('(01)20000000012346(21)000007')
    expect(ref.packageId).toBe(7)
    expect(ref.batchNumber).toBeUndefined()
  })
})

describe('parseLocationQr', () => {
  it('extracts location', () => {
    expect(parseLocationQr('LOC:L044-R01-02')).toBe('L044-R01-02')
  })
  it('rejects non-location codes', () => {
    expect(parseLocationQr('(01)20000000012346')).toBeNull()
  })
})