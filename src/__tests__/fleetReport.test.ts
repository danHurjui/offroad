import {
  complianceEvents,
  costRows,
  defaultReportPeriod,
  driversIn,
  driversOn,
  jobRows,
  parseReportPeriod,
  spendSummary,
  REPORT_MAX_DAYS,
  type AssignmentSpan,
  type ReportDocument,
  type ReportJob,
  type ReportPeriod,
} from '@/lib/fleetReport'
import type { OwnershipInput } from '@/lib/ownershipCosts'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const period = (from: string, to: string): ReportPeriod => {
  const parsed = parseReportPeriod(from, to)
  if (!parsed.ok) throw new Error(parsed.code)
  return parsed.period
}
const MARCH = period('2026-03-01', '2026-03-31')

describe('parseReportPeriod — checked on the server, whatever the form offered', () => {
  it('takes two whole days, both included', () => {
    expect(MARCH).toEqual({ from: d('2026-03-01'), to: d('2026-03-31'), end: d('2026-04-01') })
  })

  it.each([
    ['2026-03-31', '2026-03-01'],
    ['2026-02-30', '2026-03-01'],
    ['2026-3-1', '2026-03-31'],
    ['', '2026-03-31'],
    [null, null],
    ['2026-03-01T00:00:00Z', '2026-03-31'],
  ])('refuses %j → %j', (from, to) => {
    expect(parseReportPeriod(from, to)).toEqual({ ok: false, code: 'reportPeriodInvalid' })
  })

  it(`allows ${REPORT_MAX_DAYS} days and refuses one more`, () => {
    expect(parseReportPeriod('2024-01-01', '2024-12-31').ok).toBe(true) // a leap year: 366 days
    expect(parseReportPeriod('2025-01-01', '2026-01-02')).toEqual({ ok: false, code: 'reportPeriodTooLong' })
  })

  it('defaults to last calendar month, across a year end too', () => {
    expect(defaultReportPeriod(new Date('2026-09-23T10:00:00Z'))).toEqual({ from: d('2026-08-01'), to: d('2026-08-31'), end: d('2026-09-01') })
    expect(defaultReportPeriod(new Date('2026-01-05T10:00:00Z'))).toEqual({ from: d('2025-12-01'), to: d('2025-12-31'), end: d('2026-01-01') })
  })
})

const ASSIGNMENTS: AssignmentSpan[] = [
  { vehicleId: 'v1', driverName: 'Ana', startedAt: new Date('2026-03-01T08:00:00Z'), endedAt: new Date('2026-03-10T17:00:00Z') },
  { vehicleId: 'v1', driverName: 'Bogdan', startedAt: new Date('2026-03-10T18:00:00Z'), endedAt: null },
  { vehicleId: 'v2', driverName: 'Carmen', startedAt: new Date('2026-01-01T08:00:00Z'), endedAt: new Date('2026-02-01T08:00:00Z') },
]

describe('who was driving', () => {
  it('names the driver assigned that day', () => {
    expect(driversOn(ASSIGNMENTS, 'v1', d('2026-03-05'))).toEqual(['Ana'])
    expect(driversOn(ASSIGNMENTS, 'v1', d('2026-03-20'))).toEqual(['Bogdan'])
  })

  it('names both on a handover day rather than guessing the hour', () => {
    expect(driversOn(ASSIGNMENTS, 'v1', d('2026-03-10'))).toEqual(['Ana', 'Bogdan'])
  })

  it('leaves it empty when nobody was assigned', () => {
    expect(driversOn(ASSIGNMENTS, 'v2', d('2026-03-05'))).toEqual([])
    expect(driversOn(ASSIGNMENTS, 'v1', d('2026-02-28'))).toEqual([])
  })

  it('lists everyone assigned in the period', () => {
    expect(driversIn(ASSIGNMENTS, 'v1', MARCH)).toEqual(['Ana', 'Bogdan'])
    expect(driversIn(ASSIGNMENTS, 'v2', MARCH)).toEqual([])
  })
})

const job = (over: Partial<ReportJob>): ReportJob => ({
  id: 'j',
  vehicleId: 'v1',
  date: d('2026-03-05'),
  name: 'Revizie',
  category: 'SERVICE',
  status: 'DONE',
  notes: null,
  workType: 'WORKSHOP',
  workshopName: 'Service X',
  costRon: null,
  partsCostRon: 400,
  labourCostRon: 250.5,
  loggedBy: 'Ana',
  ...over,
})

describe('jobRows', () => {
  it('keeps the period’s jobs, oldest first, with the same total the app uses', () => {
    const rows = jobRows(
      [job({ id: 'late', date: d('2026-03-31') }), job({ id: 'outside', date: d('2026-04-01') }), job({ id: 'early', date: d('2026-03-01'), vehicleId: 'v2' })],
      ASSIGNMENTS,
      MARCH,
      ['v1', 'v2']
    )
    expect(rows.map((r) => r.id)).toEqual(['early', 'late'])
    expect(rows[1].total).toBe(650.5)
    expect(rows[1].drivers).toEqual(['Bogdan'])
  })

  it('totals a DIY job from its one amount', () => {
    const [row] = jobRows([job({ workType: 'DIY', costRon: 120, partsCostRon: null, labourCostRon: null })], [], MARCH, ['v1'])
    expect(row.total).toBe(120)
  })
})

const input = (vehicleId: string, over: Partial<OwnershipInput> = {}): OwnershipInput => ({
  vehicleId,
  projectType: 'DAILY_DRIVER',
  now: d('2026-09-01'),
  vehicle: {
    createdAt: d('2025-01-01'),
    purchaseDate: d('2026-03-02'),
    purchasePriceRon: 50_000,
    currentValueRon: null,
    currentValueAt: null,
    financeType: null,
    financeMonthlyRon: null,
    financeStartDate: null,
    financeEndDate: null,
    fuelType: null,
  },
  tasks: [{ id: 't1', name: 'Revizie', category: 'SERVICE', date: d('2026-03-05'), workType: 'WORKSHOP', costRon: null, partsCostRon: 400, labourCostRon: 250.5 }],
  fuel: [
    { id: 'f1', date: d('2026-03-31'), totalRon: 300, station: 'OMV' },
    { id: 'f2', date: d('2026-04-01'), totalRon: 999, station: 'OMV' },
  ],
  charges: [],
  documents: [],
  tyreSets: [],
  expenses: [],
  readings: [],
  ...over,
})

describe('costRows and spendSummary', () => {
  it('takes the costs page’s lines inside the period, with the driver that day', () => {
    const rows = costRows([input('v1')], ASSIGNMENTS, MARCH)
    expect(rows.map((r) => [r.source, r.amount, r.drivers])).toEqual([
      ['purchase', 50_000, ['Ana']],
      ['task', 650.5, ['Ana']],
      ['fuel', 300, ['Bogdan']],
    ])
  })

  it('adds up per vehicle and per category, running cost without the purchase', () => {
    const rows = costRows([input('v1'), input('v2', { vehicle: { ...input('v2').vehicle, purchasePriceRon: null } })], ASSIGNMENTS, MARCH)
    const spend = spendSummary(rows, ['v1', 'v2'], ASSIGNMENTS, MARCH)
    expect(spend.vehicles).toEqual([
      { vehicleId: 'v1', total: 50_950.5, running: 950.5, lines: 3, drivers: ['Ana', 'Bogdan'] },
      { vehicleId: 'v2', total: 950.5, running: 950.5, lines: 2, drivers: [] },
    ])
    expect(spend.total).toBe(51_901)
    expect(spend.running).toBe(1901)
    expect(Object.fromEntries(spend.categories.map((c) => [c.category, c.total]))).toEqual({ purchase: 50_000, energy: 600, work: 1301 })
  })
})

const NOW = new Date('2026-03-20T12:00:00Z')
const doc = (over: Partial<ReportDocument>): ReportDocument => ({ id: 'd', vehicleId: 'v1', type: 'RCA', expiryDate: d('2027-01-01'), renewals: [], ...over })

describe('complianceEvents', () => {
  it('lists a renewal made in the period, and no expiry when it was renewed in time', () => {
    const events = complianceEvents(
      [doc({ renewals: [{ previousExpiry: d('2026-03-10'), newExpiry: d('2027-03-10'), renewedAt: new Date('2026-03-08T09:00:00Z') }] })],
      MARCH,
      NOW
    )
    expect(events.renewals).toEqual([
      { vehicleId: 'v1', type: 'RCA', renewedAt: new Date('2026-03-08T09:00:00Z'), previousExpiry: d('2026-03-10'), newExpiry: d('2027-03-10'), lapsedDays: 0 },
    ])
    expect(events.expiries).toEqual([])
  })

  it('a renewal on the expiry day itself is in time — the document is valid through that day', () => {
    const events = complianceEvents(
      [doc({ renewals: [{ previousExpiry: d('2026-03-10'), newExpiry: d('2027-03-10'), renewedAt: new Date('2026-03-10T15:00:00Z') }] })],
      MARCH,
      NOW
    )
    expect(events.expiries).toEqual([])
    expect(events.renewals[0].lapsedDays).toBe(0)
  })

  it('says how long a late renewal left it out of date', () => {
    const events = complianceEvents(
      [doc({ renewals: [{ previousExpiry: d('2026-03-03'), newExpiry: d('2027-03-10'), renewedAt: new Date('2026-03-10T09:00:00Z') }] })],
      MARCH,
      NOW
    )
    expect(events.expiries).toEqual([
      { vehicleId: 'v1', type: 'RCA', expiredOn: d('2026-03-03'), outcome: { kind: 'renewedLate', renewedAt: new Date('2026-03-10T09:00:00Z'), lapsedDays: 7 } },
    ])
    expect(events.renewals[0].lapsedDays).toBe(7)
  })

  it('an expiry with nothing after it says no renewal is on record', () => {
    const events = complianceEvents([doc({ type: 'ITP', expiryDate: d('2026-03-15') })], MARCH, NOW)
    expect(events.expiries).toEqual([{ vehicleId: 'v1', type: 'ITP', expiredOn: d('2026-03-15'), outcome: { kind: 'notRenewed' } }])
  })

  it('a newer document of the same type is named, not claimed as a renewal', () => {
    const events = complianceEvents([doc({ id: 'old', expiryDate: d('2026-03-15') }), doc({ id: 'new', expiryDate: d('2027-03-15') })], MARCH, NOW)
    expect(events.expiries.map((e) => e.outcome)).toEqual([{ kind: 'newerOnRecord' }])
  })

  it('an expiry later in the period, or today, has not happened yet', () => {
    expect(complianceEvents([doc({ expiryDate: d('2026-03-25') }), doc({ id: 'today', expiryDate: d('2026-03-20') })], MARCH, NOW).expiries).toEqual([])
  })

  it('leaves out documents a fleet is not stopped for', () => {
    expect(complianceEvents([doc({ type: 'VIGNETTE', expiryDate: d('2026-03-15') })], MARCH, NOW).expiries).toEqual([])
  })
})
