import { parseAmount, invalidAmountResponse } from '@/lib/amounts'

describe('parseAmount', () => {
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
  ])('treats %s as not provided', (_label, value) => {
    expect(parseAmount(value)).toBeNull()
  })

  it.each([
    ['zero', 0, 0],
    ['a positive integer', 1500, 1500],
    ['a decimal', 1500.5, 1500.5],
    ['a numeric string', '250.25', 250.25],
  ])('accepts %s', (_label, value, expected) => {
    expect(parseAmount(value)).toBe(expected)
  })

  // Regression: `Number(x)` accepted these, so a negative cost reached the
  // DB and showed up in analytics totals as a refund nobody entered.
  it.each([
    ['a negative number', -5000],
    ['a negative string', '-1'],
    ['a non-numeric string', 'abc'],
    ['Infinity', Infinity],
    ['NaN', NaN],
    ['an object', {}],
    ['an array', [1]],
    ['an empty array', []],
    ['a boolean', true],
  ])('rejects %s', (_label, value) => {
    expect(parseAmount(value)).toBeUndefined()
  })
})

describe('invalidAmountResponse', () => {
  it('returns null when every field is acceptable', async () => {
    expect(await invalidAmountResponse({ costRon: 100, partsCostRon: null, labourCostRon: undefined })).toBeNull()
  })

  /**
   * The message is translated now, so what is asserted is the field name
   * reaching it and the stable `code` — the sentence around them belongs
   * to the catalogue, and i18n.test.ts checks it exists in both languages.
   */
  it('returns a 400 naming the offending field', async () => {
    const res = await invalidAmountResponse({ costRon: 10, partsCostRon: -3 })
    expect(res).not.toBeNull()
    expect(res!.status).toBe(400)
    const body = await res!.json()
    expect(body.code).toBe('amountNegative')
    expect(body.error).toContain('partsCostRon')
  })

  it('rejects a cost that would silently become NaN', async () => {
    const res = await invalidAmountResponse({ costRon: 'abc' })
    expect(res!.status).toBe(400)
    const body = await res!.json()
    expect(body.code).toBe('amountNegative')
    expect(body.error).toContain('costRon')
  })
})
