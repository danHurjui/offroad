import { hasPro, proKind, PRO_SELECT } from '@/lib/pro'

describe('hasPro', () => {
  it.each([
    ['paid only', { isPro: true, isProComped: false }],
    ['comped only', { isPro: false, isProComped: true }],
    ['both', { isPro: true, isProComped: true }],
  ])('grants access for %s', (_label, user) => {
    expect(hasPro(user)).toBe(true)
  })

  it('denies access for neither', () => {
    expect(hasPro({ isPro: false, isProComped: false })).toBe(false)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('denies access for %s rather than throwing', (_label, user) => {
    expect(hasPro(user)).toBe(false)
  })
})

describe('proKind', () => {
  it('labels a paying customer as paid', () => {
    expect(proKind({ isPro: true, isProComped: false })).toBe('paid')
  })

  it('labels a comped account as comped', () => {
    expect(proKind({ isPro: false, isProComped: true })).toBe('comped')
  })

  // Someone who was comped and later subscribed is being billed, and that
  // is the fact that matters for support and billing-portal access.
  it('prefers paid when both are set', () => {
    expect(proKind({ isPro: true, isProComped: true })).toBe('paid')
  })

  it('labels everyone else as none', () => {
    expect(proKind({ isPro: false, isProComped: false })).toBe('none')
    expect(proKind(null)).toBe('none')
  })
})

describe('PRO_SELECT', () => {
  // Gates select through this so one flag can't be read while the other is
  // silently missing — the failure mode is a comped user seeing half the
  // Pro features work.
  it('asks for both entitlement columns', () => {
    expect(PRO_SELECT).toEqual({ isPro: true, isProComped: true })
  })
})
