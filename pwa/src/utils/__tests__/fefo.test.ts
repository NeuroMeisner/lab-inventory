import { describe, expect, it } from 'vitest'
import { daysUntilExpiry, isExpired, sortByFefo } from '../fefo'

const p = (expiry: string | null) => ({ id: 1, expiry_date: expiry })

describe('FEFO', () => {
  it('sorts nearest expiry first, nulls last', () => {
    const sorted = sortByFefo([p('2030-01-01'), p(null), p('2026-12-01'), p('2027-06-01')])
    expect(sorted.map((x) => x.expiry_date)).toEqual(['2026-12-01', '2027-06-01', '2030-01-01', null])
  })

  it('detects expired packages', () => {
    expect(isExpired(p('2020-01-01'))).toBe(true)
    expect(isExpired(p('2099-01-01'))).toBe(false)
    expect(isExpired(p(null))).toBe(false)
  })

  it('counts days until expiry', () => {
    expect(daysUntilExpiry(p(null))).toBeNull()
    const d = daysUntilExpiry(p(new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)))!
    expect(d).toBeGreaterThanOrEqual(4)
    expect(d).toBeLessThanOrEqual(6)
  })
})