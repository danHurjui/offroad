import { allowsFutureDate, isFutureDate, localIsoDate } from '@/lib/taskDate'
import { PROJECT_TYPE_CONFIG, PROJECT_TYPES } from '@/lib/projectType'

/**
 * The task form capped its date field at today for every status, so a job
 * could only ever be logged as already done — "Booked in for next Tuesday"
 * was unreachable although every mode ships a status for exactly that.
 */
describe('allowsFutureDate', () => {
  it.each(PROJECT_TYPES)('bars only %s’s own complete status', (projectType) => {
    const config = PROJECT_TYPE_CONFIG[projectType]
    expect(allowsFutureDate(projectType, config.completeStatus)).toBe(false)

    for (const { value } of config.statusTags) {
      if (value === config.completeStatus) continue
      expect(allowsFutureDate(projectType, value)).toBe(true)
    }
  })

  it('lets a daily driver be booked in for a future date', () => {
    // The literal case from the bug report: a service booked at a workshop.
    expect(allowsFutureDate('DAILY_DRIVER', 'BOOKED')).toBe(true)
    expect(allowsFutureDate('DAILY_DRIVER', 'DUE')).toBe(true)
  })

  it('lets an off-road build plan work ahead', () => {
    expect(allowsFutureDate('OFFROAD', 'PLANNED')).toBe(true)
  })

  it('never hardcodes which status counts as complete', () => {
    // Restoration's is COMPLETE, the other two use DONE; a rule written
    // against one mode's spelling would silently pass for the others.
    expect(allowsFutureDate('RESTORATION', 'DONE')).toBe(true)
    expect(allowsFutureDate('RESTORATION', 'COMPLETE')).toBe(false)
  })
})

describe('isFutureDate', () => {
  it('compares ISO dates as strings', () => {
    expect(isFutureDate('2026-10-01', '2026-09-17')).toBe(true)
    expect(isFutureDate('2026-09-17', '2026-09-17')).toBe(false)
    expect(isFutureDate('2026-09-16', '2026-09-17')).toBe(false)
  })

  it('does not trip over a year or month boundary', () => {
    expect(isFutureDate('2027-01-01', '2026-12-31')).toBe(true)
    expect(isFutureDate('2026-09-30', '2026-10-01')).toBe(false)
  })
})

describe('localIsoDate', () => {
  it('reads the local calendar, not UTC', () => {
    // 01:30 on the 18th in Romania is still the 17th in UTC, so
    // toISOString() would call the viewer's own today a future date and
    // refuse a job finished this morning.
    const localMidnightish = new Date(2026, 8, 18, 1, 30)
    expect(localIsoDate(localMidnightish)).toBe('2026-09-18')
  })

  it('zero-pads, so the string compare above stays correct', () => {
    expect(localIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
