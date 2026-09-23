import { formatAmount, formatRon } from '@/lib/money'

// RL-041: one way to write RON, the Romanian one, for exports and screens.
describe('formatRon / formatAmount', () => {
  it('writes the ticket’s example the Romanian way', () => {
    expect(formatRon(14999.5)).toBe('14.999,50 RON')
  })

  it('groups thousands with a dot and always prints the bani', () => {
    expect(formatAmount(1234)).toBe('1.234,00')
    expect(formatAmount(1234567.891)).toBe('1.234.567,89')
    expect(formatAmount(5)).toBe('5,00')
  })

  it('rounds to whole lei when asked', () => {
    expect(formatRon(1234.5, 0)).toBe('1.235 RON')
  })

  it('never prints a negative zero', () => {
    expect(formatAmount(-0)).toBe('0,00')
  })
})
