import {
  isTicketType,
  isTicketStatus,
  isTicketSort,
  validateText,
  TICKET_TYPES,
  TICKET_STATUSES,
  TICKET_TYPE_VALUES,
  TICKET_STATUS_VALUES,
  TICKET_TITLE_MAX,
} from '@/lib/tickets'

describe('ticket type/status guards', () => {
  it('accepts every configured value', () => {
    for (const t of TICKET_TYPE_VALUES) expect(isTicketType(t)).toBe(true)
    for (const s of TICKET_STATUS_VALUES) expect(isTicketStatus(s)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isTicketType('WISH')).toBe(false)
    expect(isTicketType(undefined)).toBe(false)
    expect(isTicketStatus('CLOSED')).toBe(false)
    expect(isTicketStatus(null)).toBe(false)
  })

  // Guards use hasOwnProperty, so prototype keys must not slip through as
  // a valid enum value and reach Prisma.
  it('does not accept inherited object properties', () => {
    expect(isTicketType('toString')).toBe(false)
    expect(isTicketStatus('constructor')).toBe(false)
  })

  it('validates the sort parameter', () => {
    expect(isTicketSort('votes')).toBe(true)
    expect(isTicketSort('newest')).toBe(true)
    expect(isTicketSort('vote_count DESC; DROP TABLE')).toBe(false)
  })
})

describe('config completeness', () => {
  it.each(TICKET_TYPE_VALUES)('%s has a label, blurb and badge', (t) => {
    expect(TICKET_TYPES[t].label).toBeTruthy()
    expect(TICKET_TYPES[t].blurb).toBeTruthy()
    expect(TICKET_TYPES[t].badgeClass).toBeTruthy()
  })

  it.each(TICKET_STATUS_VALUES)('%s has a label and badge', (s) => {
    expect(TICKET_STATUSES[s].label).toBeTruthy()
    expect(TICKET_STATUSES[s].badgeClass).toBeTruthy()
  })

  it('marks exactly the closed statuses as not open', () => {
    const closed = TICKET_STATUS_VALUES.filter((s) => !TICKET_STATUSES[s].open)
    expect(closed.sort()).toEqual(['DECLINED', 'DONE', 'DUPLICATE'])
  })
})

describe('validateText', () => {
  it('trims and returns a valid value', () => {
    const r = validateText('  Winch page crashes  ', 'title', TICKET_TITLE_MAX)
    expect(r).toEqual({ ok: true, value: 'Winch page crashes' })
  })

  it.each([
    ['empty string', ''],
    ['whitespace only', '   '],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
  ])('rejects %s', (_label, value) => {
    const r = validateText(value, 'title', TICKET_TITLE_MAX)
    expect(r.ok).toBe(false)
  })

  // Length is capped server-side; the client maxlength is advisory only.
  it('rejects text over the maximum', () => {
    const r = validateText('a'.repeat(TICKET_TITLE_MAX + 1), 'title', TICKET_TITLE_MAX)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/120 characters or fewer/)
  })

  it('accepts text exactly at the maximum', () => {
    expect(validateText('a'.repeat(TICKET_TITLE_MAX), 'title', TICKET_TITLE_MAX).ok).toBe(true)
  })

  it('counts length after trimming, not before', () => {
    const padded = `  ${'a'.repeat(TICKET_TITLE_MAX)}  `
    expect(validateText(padded, 'title', TICKET_TITLE_MAX).ok).toBe(true)
  })
})
