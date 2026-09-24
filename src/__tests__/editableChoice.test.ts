jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    vehicle: { findMany: jest.fn(), updateMany: jest.fn() },
    organization: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/rateLimit', () => ({ ...jest.requireActual('@/lib/rateLimit'), consumeRateLimit: jest.fn() }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rateLimit'
import { overLimitIds } from '@/lib/plans'
import { PUT as choosePersonal } from '@/app/api/me/editable-vehicles/route'
import { PUT as chooseOrg } from '@/app/api/organizations/[orgId]/editable-vehicles/route'

const vehicle = prisma.vehicle as unknown as Record<string, jest.Mock>
const member = prisma.organizationMember.findUnique as jest.Mock
const rate = consumeRateLimit as jest.Mock
const req = (b: unknown) => ({ json: () => Promise.resolve(b) }) as never
const FREE = { isPro: false, isProComped: false, proPlan: null, grandfatheredAt: null }
const d = (s: string) => new Date(s)

beforeEach(() => {
  jest.clearAllMocks()
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'me', active: true } })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(FREE)
  vehicle.findMany.mockResolvedValue(['a', 'b', 'c'].map((id, i) => ({ id, createdAt: new Date(2025, 0, i + 1) })))
  vehicle.updateMany.mockResolvedValue({ count: 1 })
  ;(prisma.$transaction as jest.Mock).mockResolvedValue([])
  rate.mockResolvedValue({ ok: true })
})

describe('which vehicles stay editable', () => {
  const a = { id: 'a', createdAt: d('2024-01-01') }
  const b = { id: 'b', createdAt: d('2025-01-01') }
  const c = { id: 'c', createdAt: d('2026-01-01') }

  it('keeps the chosen ones ahead of the oldest', () => {
    expect(overLimitIds([a, b, { ...c, keptEditableAt: d('2026-06-01') }], 1)).toEqual(['a', 'b'])
  })

  it('falls back to the oldest when nothing is chosen, as before', () => {
    expect(overLimitIds([c, b, a], 1)).toEqual(['b', 'c'])
  })

  it('keeps the oldest chosen when more are chosen than the plan covers', () => {
    const kept = d('2026-06-01')
    expect(overLimitIds([{ ...a, keptEditableAt: kept }, { ...b, keptEditableAt: kept }, c], 1)).toEqual(['b', 'c'])
  })
})

describe('PUT /api/me/editable-vehicles', () => {
  it('records the whole choice, clearing the rest of the garage', async () => {
    const res = await choosePersonal(req({ vehicleIds: ['c'] }))
    expect(res.status).toBe(200)
    expect(vehicle.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 'me', organizationId: null, id: { notIn: ['c'] } },
      data: { keptEditableAt: null },
    })
    expect(vehicle.updateMany).toHaveBeenCalledWith({
      where: { ownerId: 'me', organizationId: null, id: { in: ['c'] }, keptEditableAt: null },
      data: { keptEditableAt: expect.any(Date) },
    })
    expect(rate).toHaveBeenCalledWith('editableChoice', 'user:me')
  })

  it('refuses more than the plan covers', async () => {
    const res = await choosePersonal(req({ vehicleIds: ['a', 'b'] }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('tooManyEditable')
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('refuses a vehicle that is not one of the account’s personal ones', async () => {
    expect((await choosePersonal(req({ vehicleIds: ['someone-elses'] }))).status).toBe(400)
    expect((await choosePersonal(req({ vehicleIds: 'a' }))).status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('is rate-limited, so the choice cannot be rotated to edit everything', async () => {
    rate.mockResolvedValue({ ok: false, retryAfterSeconds: 3600 })
    expect((await choosePersonal(req({ vehicleIds: ['a'] }))).status).toBe(429)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('PUT /api/organizations/[orgId]/editable-vehicles', () => {
  const params = { params: { orgId: 'o1' } }
  const as = (role: string) =>
    member.mockResolvedValue({ role, organization: { id: 'o1', plan: 'PRO_MONTHLY', compedAt: null } })

  it('is for the people who manage the vehicles', async () => {
    as('MECHANIC')
    expect((await chooseOrg(req({ vehicleIds: ['a'] }), params)).status).toBe(403)
    member.mockResolvedValue(null)
    expect((await chooseOrg(req({ vehicleIds: ['a'] }), params)).status).toBe(404)
  })

  it('lets a fleet manager choose within the plan, on the organisation’s budget', async () => {
    as('FLEET_MANAGER')
    const res = await chooseOrg(req({ vehicleIds: ['a', 'c'] }), params)
    expect(res.status).toBe(200)
    expect(vehicle.updateMany).toHaveBeenCalledWith({ where: { organizationId: 'o1', id: { notIn: ['a', 'c'] } }, data: { keptEditableAt: null } })
    expect(rate).toHaveBeenCalledWith('editableChoice', 'org:o1')
  })

  it('refuses more than the plan covers', async () => {
    member.mockResolvedValue({ role: 'OWNER', organization: { id: 'o1', plan: null, compedAt: null } })
    const res = await chooseOrg(req({ vehicleIds: ['a'] }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('tooManyEditable')
  })
})
