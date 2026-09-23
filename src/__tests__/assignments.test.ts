jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    vehicleAssignment: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
  },
}))

import fs from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET as list, POST as assign } from '@/app/api/vehicles/[id]/assignments/route'
import { POST as end } from '@/app/api/vehicles/[id]/assignments/[assignmentId]/end/route'

const session = getServerSession as jest.Mock
const vehicleFind = prisma.vehicle.findUnique as jest.Mock
const memberFind = prisma.organizationMember.findUnique as jest.Mock
const a = prisma.vehicleAssignment as unknown as Record<string, jest.Mock>
const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never
const params = { params: { id: 'v1' } }
const endParams = { params: { id: 'v1', assignmentId: 'a1' } }

const COMPANY = { id: 'v1', ownerId: 'record', organizationId: 'o1' }
/** Roles by user id, in organisation o1. */
function members(roles: Record<string, string>) {
  memberFind.mockImplementation(({ where }: { where: { organizationId_userId: { userId: string } } }) => {
    const role = roles[where.organizationId_userId.userId]
    return Promise.resolve(role ? { role } : null)
  })
}
const as = (id: string) => session.mockResolvedValue({ user: { id, active: true } })

beforeEach(() => {
  jest.clearAllMocks()
  vehicleFind.mockResolvedValue(COMPANY)
  ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue(null)
  a.findFirst.mockResolvedValue(null)
  a.updateMany.mockResolvedValue({ count: 1 })
  members({ boss: 'FLEET_MANAGER', dan: 'DRIVER', mech: 'MECHANIC' })
  as('boss')
})

describe('assigning', () => {
  it('a manager assigns a DRIVER of the organisation, from now', async () => {
    a.create.mockResolvedValue({ id: 'a1' })
    expect((await assign(req({ driverUserId: 'dan', note: ' Day shift ' }), params)).status).toBe(201)
    expect(a.create).toHaveBeenCalledWith({ data: { vehicleId: 'v1', driverUserId: 'dan', note: 'Day shift', assignedByUserId: 'boss' } })
  })

  it.each([['mech'], ['stranger'], ['']])('refuses %p, who is not a driver there', async (driverUserId) => {
    const res = await assign(req({ driverUserId }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('assignDriverOnly')
    expect(a.create).not.toHaveBeenCalled()
  })

  it('a second active driver is refused by the database', async () => {
    a.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' }))
    const res = await assign(req({ driverUserId: 'dan' }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('vehicleAlreadyAssigned')
  })

  it('only for a company vehicle, and only by a manager', async () => {
    vehicleFind.mockResolvedValue({ ...COMPANY, organizationId: null, ownerId: 'boss' })
    expect((await (await assign(req({ driverUserId: 'dan' }), params)).json()).code).toBe('vehicleNotCompany')
    vehicleFind.mockResolvedValue(COMPANY)
    for (const who of ['dan', 'mech']) {
      as(who)
      expect((await assign(req({ driverUserId: 'dan' }), params)).status).toBe(404)
      expect((await list({} as never, params)).status).toBe(404)
    }
    expect(a.create).not.toHaveBeenCalled()
  })

  /** The rule is the database's, not the form's (the ticket's own words). */
  it('one active driver per vehicle is a partial unique index', () => {
    const sql = fs.readFileSync(path.join(process.cwd(), 'prisma/migrations/20260929120000_vehicle_assignments/migration.sql'), 'utf8')
    expect(sql).toMatch(/CREATE UNIQUE INDEX "VehicleAssignment_one_active_per_vehicle" ON "VehicleAssignment"\("vehicleId"\) WHERE "endedAt" IS NULL/)
  })
})

describe('ending', () => {
  const ACTIVE = { id: 'a1', vehicleId: 'v1', driverUserId: 'dan', endedAt: null }

  it('the driver hands it back, conditional on it still being active', async () => {
    as('dan')
    a.findFirst.mockResolvedValue({ id: 'a1' }) // dan is assigned, so has driver access
    a.findUnique.mockResolvedValue(ACTIVE)
    expect((await end({} as never, endParams)).status).toBe(200)
    expect(a.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', endedAt: null }, data: { endedAt: expect.any(Date) } })
  })

  it('a manager ends anyone’s; ending twice changes nothing', async () => {
    a.findUnique.mockResolvedValue(ACTIVE)
    expect((await end({} as never, endParams)).status).toBe(200)
    a.updateMany.mockResolvedValue({ count: 0 })
    expect((await (await end({} as never, endParams)).json()).code).toBe('assignmentAlreadyEnded')
  })

  it('a mechanic cannot end a driver’s assignment', async () => {
    as('mech')
    a.findUnique.mockResolvedValue(ACTIVE)
    expect((await end({} as never, endParams)).status).toBe(404)
    expect(a.updateMany).not.toHaveBeenCalled()
  })

  it('an assignment of another vehicle is a 404', async () => {
    a.findUnique.mockResolvedValue({ ...ACTIVE, vehicleId: 'v9' })
    expect((await end({} as never, endParams)).status).toBe(404)
  })
})
