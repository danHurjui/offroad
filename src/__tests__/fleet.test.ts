jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import fs from 'fs'
import path from 'path'
import { complianceBoard, fleetCost, FLEET_DOCUMENT_TYPES, type FleetDocument, type FleetVehicle } from '@/lib/fleet'
import { ownershipReport, type OwnershipInput } from '@/lib/ownershipCosts'
import { getDocumentStatus } from '@/lib/documents'

const NOW = new Date('2026-09-23T12:00:00Z')
const inDays = (n: number) => new Date(NOW.getTime() + n * 86400000)
const v = (id: string, over: Partial<FleetVehicle> = {}): FleetVehicle => ({ id, year: 2020, make: 'Dacia', model: 'Logan', plate: `B ${id}`, ...over })
const doc = (vehicleId: string, type: string, days: number): FleetDocument => ({ vehicleId, type, expiryDate: inDays(days) })

describe('complianceBoard', () => {
  it('puts anything expired first and counts it as off the road', () => {
    const board = complianceBoard(
      [v('fine'), v('soon'), v('expired')],
      [doc('fine', 'ITP', 200), doc('soon', 'RCA', 5), doc('expired', 'ITP', -2), doc('expired', 'RCA', 100)],
      NOW
    )
    expect(board.rows.map((r) => r.vehicle.id)).toEqual(['expired', 'soon', 'fine'])
    expect(board.rows[0].expired).toEqual(['ITP'])
    expect(board.totals).toMatchObject({ vehicles: 3, offRoad: 1, expiring: 1 })
  })

  it('uses the same day count as the documents board and the reminders', () => {
    const board = complianceBoard([v('a')], [doc('a', 'ITP', 10)], NOW)
    expect(board.rows[0].cells.ITP).toEqual({ expiryDate: inDays(10), ...getDocumentStatus(inDays(10), NOW) })
  })

  it('nothing recorded is none, not fine, and sorts after known dates', () => {
    const board = complianceBoard([v('empty'), v('a')], [doc('a', 'ITP', 300)], NOW)
    expect(board.rows.map((r) => r.vehicle.id)).toEqual(['a', 'empty'])
    const empty = board.rows[1]
    expect(empty.cells.ITP).toBeNull()
    expect(empty.missing).toEqual([...FLEET_DOCUMENT_TYPES])
    expect(empty.soonest).toBeNull()
    expect(board.totals.missingItpOrRca).toBe(2) // `a` has no RCA
  })

  it('takes the later of two documents of one type', () => {
    const board = complianceBoard([v('a')], [doc('a', 'RCA', -40), doc('a', 'RCA', 300)], NOW)
    expect(board.rows[0].cells.RCA?.status).toBe('valid')
    expect(board.totals.offRoad).toBe(0)
  })

  it('ignores the travel vignette and unknown types', () => {
    const board = complianceBoard([v('a')], [doc('a', 'VIGNETTE', -5), doc('a', 'WHATEVER', -5)], NOW)
    expect(board.totals.offRoad).toBe(0)
  })

  it('historic status is a label and changes no count', () => {
    const old = complianceBoard([v('a', { year: 1980 })], [doc('a', 'ITP', -1)], NOW)
    const young = complianceBoard([v('a')], [doc('a', 'ITP', -1)], NOW)
    expect(old.rows[0].historic).toBe(true)
    expect(old.totals).toEqual(young.totals)
  })
})

describe('the fleet page', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/app/dashboard/organizations/[orgId]/fleet/page.tsx'), 'utf8')

  it('is for the people who manage the vehicles, and a 404 for anyone else', () => {
    expect(source).toContain("accessForRole(membership.role) !== 'owner'")
    expect(source).toContain('notFound()')
  })

  /** A fleet board with a partial answer is worse than none. */
  it('never takes a page of the vehicles', () => {
    expect(source).not.toMatch(/\btake:/)
  })
})

describe('fleetCost', () => {
  const base = (id: string, over: Partial<OwnershipInput> = {}): OwnershipInput => ({
    vehicleId: id,
    projectType: 'DAILY_DRIVER',
    now: NOW,
    vehicle: {
      createdAt: new Date('2025-09-23T00:00:00Z'),
      purchaseDate: new Date('2025-09-23T00:00:00Z'),
      purchasePriceRon: null,
      currentValueRon: null,
      currentValueAt: null,
      financeType: null,
      financeMonthlyRon: null,
      financeStartDate: null,
      financeEndDate: null,
    },
    tasks: [],
    fuel: [],
    documents: [],
    tyreSets: [],
    expenses: [],
    readings: [],
    ...over,
  })
  const fill = (id: string, date: string, totalRon: number) => ({ id, date: new Date(date), totalRon, station: null })

  it('is each vehicle’s own ownership report, added up', () => {
    const a = base('a', { fuel: [fill('f1', '2026-08-10T00:00:00Z', 300)] })
    const b = base('b', { fuel: [fill('f2', '2026-09-01T00:00:00Z', 200)] })
    const cost = fleetCost([a, b], '12m')
    expect(cost.rows.map((r) => r.runningTotal)).toEqual([
      ownershipReport(a, '12m').runningTotal,
      ownershipReport(b, '12m').runningTotal,
    ])
    expect(cost.runningTotal).toBe(500)
  })

  it('leaves the purchase out of running cost and the trend, but not the total', () => {
    const a = base('a', {
      vehicle: { ...base('a').vehicle, purchasePriceRon: 50000, purchaseDate: new Date('2026-06-01T00:00:00Z') },
      fuel: [fill('f1', '2026-07-01T00:00:00Z', 400)],
    })
    const cost = fleetCost([a], '12m')
    expect(cost.total).toBe(50400)
    expect(cost.runningTotal).toBe(400)
    expect(cost.trend.reduce((s, m) => s + m.total, 0)).toBe(400)
  })

  it('weighs per vehicle per month by the months each was owned', () => {
    // `a` owned all year, `b` bought a month ago: 1200 over ~13 vehicle-months, not 1200 / 2 / 12.
    const a = base('a', { vehicle: { ...base('a').vehicle, purchaseDate: new Date('2025-01-01T00:00:00Z') }, fuel: [fill('f1', '2026-03-01T00:00:00Z', 1200)] })
    const b = base('b', { vehicle: { ...base('b').vehicle, purchaseDate: new Date('2026-08-23T00:00:00Z') } })
    const cost = fleetCost([a, b], '12m')
    const months = cost.rows.reduce((s, r) => s + r.months, 0)
    expect(months).toBeGreaterThan(12.5)
    expect(months).toBeLessThan(13.5)
    expect(cost.perVehiclePerMonth).toBeCloseTo(1200 / months, 2)
  })

  it('fills the months in between with zero, up to this month', () => {
    const a = base('a', { fuel: [fill('f1', '2026-06-15T00:00:00Z', 100)] })
    expect(fleetCost([a], '12m').trend).toEqual([
      { month: '2026-06', total: 100 },
      { month: '2026-07', total: 0 },
      { month: '2026-08', total: 0 },
      { month: '2026-09', total: 0 },
    ])
  })

  it('counts vehicles whose record has gaps rather than filling them in', () => {
    const cost = fleetCost([base('a'), base('b', { fuel: [fill('f1', '2026-09-01T00:00:00Z', 50)] })], '12m')
    expect(cost.rows[0].gaps).toBeGreaterThan(0) // no fuel logged
    expect(cost.vehiclesWithGaps).toBeGreaterThanOrEqual(1)
  })

  it('has no per-vehicle figure for an empty fleet', () => {
    expect(fleetCost([], '12m')).toMatchObject({ rows: [], total: 0, perVehiclePerMonth: null, trend: [] })
  })
})

describe('one loader for the vehicle and the fleet cost pages', () => {
  it.each(['src/app/dashboard/vehicles/[id]/costs/page.tsx', 'src/app/dashboard/organizations/[orgId]/fleet/costs/page.tsx'])(
    '%s loads through loadOwnershipInputs()',
    (file) => {
      expect(fs.readFileSync(path.join(process.cwd(), file), 'utf8')).toContain('loadOwnershipInputs(')
    }
  )
})
