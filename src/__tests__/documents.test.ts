import {
  getDocumentStatus,
  isHistoricVehicle,
  isValidDocumentType,
  decideReminder,
  formatDaysUntil,
  DOCUMENT_TYPE_OPTIONS,
} from '@/lib/documents'

describe('isValidDocumentType', () => {
  it('accepts every type in DOCUMENT_TYPE_OPTIONS', () => {
    for (const t of DOCUMENT_TYPE_OPTIONS) expect(isValidDocumentType(t.value)).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isValidDocumentType('MOT')).toBe(false)
    expect(isValidDocumentType(undefined)).toBe(false)
  })
})

describe('getDocumentStatus', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it('is valid when more than 30 days out', () => {
    const result = getDocumentStatus(new Date('2026-03-01T00:00:00Z'), now)
    expect(result.status).toBe('valid')
    expect(result.daysUntil).toBeGreaterThan(30)
  })

  it('is expiring at exactly 30 days', () => {
    const result = getDocumentStatus(new Date('2026-01-31T00:00:00Z'), now)
    expect(result.daysUntil).toBe(30)
    expect(result.status).toBe('expiring')
  })

  it('is expired for a past date', () => {
    const result = getDocumentStatus(new Date('2025-12-01T00:00:00Z'), now)
    expect(result.status).toBe('expired')
    expect(result.daysUntil).toBeLessThan(0)
  })
})

describe('isHistoricVehicle', () => {
  const now = new Date('2026-01-01T00:00:00Z')

  it('is true at exactly 30 years old', () => {
    expect(isHistoricVehicle(1996, now)).toBe(true)
  })
  it('is false one year short', () => {
    expect(isHistoricVehicle(1997, now)).toBe(false)
  })
})

describe('formatDaysUntil', () => {
  it('formats a future date', () => {
    expect(formatDaysUntil(5)).toBe('expires in 5 days')
    expect(formatDaysUntil(1)).toBe('expires in 1 day')
  })
  it('formats today', () => {
    expect(formatDaysUntil(0)).toBe('expires today')
  })
  it('formats a past date', () => {
    expect(formatDaysUntil(-1)).toBe('expired 1 day ago')
    expect(formatDaysUntil(-10)).toBe('expired 10 days ago')
  })
})

describe('decideReminder', () => {
  const unsent = {
    reminder30SentAt: null,
    reminder14SentAt: null,
    reminder7SentAt: null,
    reminder3SentAt: null,
    reminder1SentAt: null,
  }

  it('does not send when no threshold is reached', () => {
    const result = decideReminder(45, unsent)
    expect(result.shouldSend).toBe(false)
  })

  it('sends the 30-day reminder when crossing it for the first time', () => {
    const result = decideReminder(30, unsent)
    expect(result.shouldSend).toBe(true)
    expect(result.milestoneDays).toBe(30)
    expect(result.fieldsToMarkSent).toEqual(['reminder30SentAt'])
  })

  it('does not re-send a milestone already marked sent', () => {
    const result = decideReminder(25, { ...unsent, reminder30SentAt: new Date() })
    expect(result.shouldSend).toBe(false)
  })

  it('sends the 14-day reminder once 30 is already sent', () => {
    const result = decideReminder(14, { ...unsent, reminder30SentAt: new Date() })
    expect(result.shouldSend).toBe(true)
    expect(result.milestoneDays).toBe(14)
    expect(result.fieldsToMarkSent).toEqual(['reminder14SentAt'])
  })

  it('sends one catch-up reminder and marks every reached-but-unsent field when multiple thresholds are crossed at once', () => {
    const result = decideReminder(10, unsent)
    expect(result.shouldSend).toBe(true)
    expect(result.milestoneDays).toBe(14) // most urgent reached: 10 <= 14 but 10 > 7
    expect(result.fieldsToMarkSent).toEqual(['reminder30SentAt', 'reminder14SentAt'])
  })

  it('still sends after expiry if the last marks were never sent', () => {
    const result = decideReminder(-2, {
      ...unsent,
      reminder30SentAt: new Date(),
      reminder14SentAt: new Date(),
    })
    expect(result.shouldSend).toBe(true)
    // Everything below 14 is reached once expired; the email is worded
    // with the most urgent of them.
    expect(result.milestoneDays).toBe(1)
    expect(result.fieldsToMarkSent).toEqual([
      'reminder7SentAt',
      'reminder3SentAt',
      'reminder1SentAt',
    ])
  })

  /**
   * Issue #21: an ITP or RCA is worth chasing a week out and again the day
   * before, which is when people actually book one.
   */
  it('sends the 7-day reminder a week before expiry', () => {
    const result = decideReminder(7, {
      ...unsent,
      reminder30SentAt: new Date(),
      reminder14SentAt: new Date(),
    })
    expect(result.shouldSend).toBe(true)
    expect(result.milestoneDays).toBe(7)
    expect(result.fieldsToMarkSent).toEqual(['reminder7SentAt'])
  })

  it('sends the 24-hour reminder the day before expiry', () => {
    const result = decideReminder(1, {
      ...unsent,
      reminder30SentAt: new Date(),
      reminder14SentAt: new Date(),
      reminder7SentAt: new Date(),
      reminder3SentAt: new Date(),
    })
    expect(result.shouldSend).toBe(true)
    expect(result.milestoneDays).toBe(1)
    expect(result.fieldsToMarkSent).toEqual(['reminder1SentAt'])
  })

  it('does not fire the 24-hour reminder while more than a day remains', () => {
    const result = decideReminder(2, {
      ...unsent,
      reminder30SentAt: new Date(),
      reminder14SentAt: new Date(),
      reminder7SentAt: new Date(),
      reminder3SentAt: new Date(),
    })
    expect(result.shouldSend).toBe(false)
  })

  // Five thresholds now, and each must fire exactly once over a document's
  // life — no duplicates, none skipped.
  it('fires each milestone exactly once as expiry approaches', () => {
    const state: { [K in keyof typeof unsent]: Date | null } = { ...unsent }
    const fired: number[] = []
    for (let days = 40; days >= -1; days--) {
      const result = decideReminder(days, state)
      if (!result.shouldSend) continue
      fired.push(result.milestoneDays!)
      for (const field of result.fieldsToMarkSent) state[field] = new Date()
    }
    expect(fired).toEqual([30, 14, 7, 3, 1])
  })

  it('sends nothing once every milestone is sent', () => {
    const allSent = {
      reminder30SentAt: new Date(),
      reminder14SentAt: new Date(),
      reminder7SentAt: new Date(),
      reminder3SentAt: new Date(),
      reminder1SentAt: new Date(),
    }
    expect(decideReminder(-5, allSent).shouldSend).toBe(false)
  })
})
