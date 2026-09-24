import {
  parseDonationBani,
  supporterName,
  formatBani,
  baniToRon,
  MIN_DONATION_BANI,
  MAX_DONATION_BANI,
  DONATION_PRESETS_RON,
} from '@/lib/donations'

describe('parseDonationBani', () => {
  it('converts RON to bani', () => {
    expect(parseDonationBani(50)).toBe(5000)
    expect(parseDonationBani('25')).toBe(2500)
    expect(parseDonationBani(12.5)).toBe(1250)
  })

  it('accepts every preset', () => {
    for (const preset of DONATION_PRESETS_RON) {
      expect(parseDonationBani(preset)).toBe(preset * 100)
    }
  })

  it('rounds to the nearest ban', () => {
    // 12.345 RON isn't a chargeable amount; Stripe needs an integer minor unit.
    expect(parseDonationBani(12.345)).toBe(1235)
    expect(Number.isInteger(parseDonationBani(9.999))).toBe(true)
  })

  it('enforces the minimum and maximum', () => {
    expect(parseDonationBani(baniToRon(MIN_DONATION_BANI))).toBe(MIN_DONATION_BANI)
    expect(parseDonationBani(baniToRon(MAX_DONATION_BANI))).toBe(MAX_DONATION_BANI)
    expect(parseDonationBani(baniToRon(MIN_DONATION_BANI) - 1)).toBeUndefined()
    expect(parseDonationBani(baniToRon(MAX_DONATION_BANI) + 1)).toBeUndefined()
  })

  // The amount comes from the client, so this is the only thing between a
  // hand-crafted request and a charge.
  it.each([
    ['zero', 0],
    ['a negative amount', -50],
    ['a negative string', '-100'],
    ['a non-numeric string', 'free'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
    ['an array that would coerce', [50]],
    ['a boolean', true],
  ])('rejects %s', (_label, value) => {
    expect(parseDonationBani(value)).toBeUndefined()
  })
})

describe('supporterName', () => {
  it('uses the display name for an attributed donation', () => {
    expect(supporterName({ isAnonymous: false, user: { displayName: 'Dan' } })).toBe('Dan')
  })

  it('honours the anonymous flag even when a user is attached', () => {
    expect(supporterName({ isAnonymous: true, user: { displayName: 'Dan' } })).toBe('Anonymous')
  })

  it('falls back to Anonymous for a guest donation', () => {
    expect(supporterName({ isAnonymous: false, user: null })).toBe('Anonymous')
  })
})

describe('formatBani', () => {
  it('renders bani as a RON amount', () => {
    expect(formatBani(5000)).toBe('50 RON')
    expect(formatBani(1250)).toBe('12,50 RON')
    expect(formatBani(1_000_000)).toBe('10.000 RON')
  })
})
