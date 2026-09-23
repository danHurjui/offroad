jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import fs from 'fs'
import path from 'path'
import { complianceBoard, FLEET_DOCUMENT_TYPES, type FleetDocument, type FleetVehicle } from '@/lib/fleet'
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
