import { describe, expect, it } from 'vitest'
import { fractionAmount } from '../amount'

describe('fractionAmount', () => {
  it('computes fractions of nominal', () => {
    expect(fractionAmount(1000, 0.25)).toBe(250)
    expect(fractionAmount(1000, 0.5)).toBe(500)
    expect(fractionAmount(999, 0.75)).toBe(749.25)
  })
  it('returns null without nominal', () => {
    expect(fractionAmount(null, 0.5)).toBeNull()
  })
})