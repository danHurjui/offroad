import { toNumberOrNull, serializeTask } from '@/lib/serialize'

describe('toNumberOrNull', () => {
  it('passes plain numbers through', () => {
    expect(toNumberOrNull(42)).toBe(42)
  })
  it('returns null for null/undefined', () => {
    expect(toNumberOrNull(null)).toBeNull()
    expect(toNumberOrNull(undefined)).toBeNull()
  })
  it('converts a Decimal-like object via toNumber()', () => {
    expect(toNumberOrNull({ toNumber: () => 12.5 } as never)).toBe(12.5)
  })
})

describe('serializeTask', () => {
  it('sums parts+labour for a workshop task', () => {
    const result = serializeTask({
      workType: 'WORKSHOP',
      costRon: null,
      partsCostRon: { toNumber: () => 100 } as never,
      labourCostRon: { toNumber: () => 250 } as never,
    })
    expect(result.totalCostRon).toBe(350)
  })

  it('uses costRon for a DIY task', () => {
    const result = serializeTask({
      workType: 'DIY',
      costRon: { toNumber: () => 500 } as never,
      partsCostRon: null,
      labourCostRon: null,
    })
    expect(result.totalCostRon).toBe(500)
  })

  it('defaults to 0 when no cost was recorded', () => {
    const result = serializeTask({ workType: 'DIY', costRon: null, partsCostRon: null, labourCostRon: null })
    expect(result.totalCostRon).toBe(0)
  })
})
