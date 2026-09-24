jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    vehicleAssignment: { updateMany: jest.fn() },
    organization: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import fs from 'fs'
import path from 'path'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST as move, DELETE as moveOut } from '@/app/api/vehicles/[id]/organization/route'
import { PATCH as vehiclePatch } from '@/app/api/vehicles/[id]/route'

/**
 * RL-038 slice 3: company vehicles, route by route. The permission table
 * itself is in vehicleAccess.test.ts; this covers what the routes add.
 */

const mockSession = getServerSession as jest.Mock
const vehicle = prisma.vehicle as unknown as Record<string, jest.Mock>
const memberFind = prisma.organizationMember.findUnique as jest.Mock
const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never
const params = { params: { id: 'v1' } }

const PERSONAL = { id: 'v1', ownerId: 'me', organizationId: null, isPublic: true, projectType: 'DAILY_DRIVER' }
const COMPANY = { ...PERSONAL, ownerId: 'someone', organizationId: 'o1', isPublic: false }

/** The caller's role in each organisation. */
function roles(byOrg: Record<string, string>) {
  memberFind.mockImplementation(({ where }: { where: { organizationId_userId: { organizationId: string } } }) => {
    const role = byOrg[where.organizationId_userId.organizationId]
    return Promise.resolve(role ? { role } : null)
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockResolvedValue({ user: { id: 'me', active: true } })
  ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue(null)
  // RL-042 slice 3: a beta organisation — comped, no vehicle cap.
  ;(prisma.organization.findUnique as jest.Mock).mockResolvedValue({ plan: null, compedAt: new Date() })
  vehicle.findUnique.mockResolvedValue(PERSONAL)
  vehicle.updateMany.mockResolvedValue({ count: 1 })
  ;(prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
  roles({})
})

describe('POST /api/vehicles/[id]/organization', () => {
  it.each(['OWNER', 'FLEET_MANAGER'])('moves a personal vehicle into an organisation where the owner is %s, and unpublishes it', async (role) => {
    roles({ o1: role })
    const res = await move(req({ organizationId: 'o1' }), params)
    expect(res.status).toBe(200)
    expect(vehicle.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', organizationId: null },
      data: { organizationId: 'o1', isPublic: false, keptEditableAt: null, siteId: null },
    })
  })

  it.each(['MECHANIC', 'DRIVER'])('refuses an organisation where the owner is only %s', async (role) => {
    roles({ o1: role })
    const res = await move(req({ organizationId: 'o1' }), params)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('orgMoveNotAllowed')
    expect(vehicle.updateMany).not.toHaveBeenCalled()
  })

  it('refuses an organisation the owner is not in, or none at all', async () => {
    expect((await move(req({ organizationId: 'o9' }), params)).status).toBe(403)
    expect((await move(req({}), params)).status).toBe(403)
    expect(vehicle.updateMany).not.toHaveBeenCalled()
  })

  it('is a 404 to a collaborator', async () => {
    vehicle.findUnique.mockResolvedValue({ ...PERSONAL, ownerId: 'someone' })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    roles({ o1: 'OWNER' })
    expect((await move(req({ organizationId: 'o1' }), params)).status).toBe(404)
  })

  it('does not move a company vehicle again', async () => {
    vehicle.findUnique.mockResolvedValue(COMPANY)
    roles({ o1: 'OWNER', o2: 'OWNER' })
    const res = await move(req({ organizationId: 'o2' }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('vehicleAlreadyCompany')
    expect(vehicle.updateMany).not.toHaveBeenCalled()
  })

  it('two moves at once: the second finds it no longer personal', async () => {
    roles({ o1: 'OWNER' })
    vehicle.updateMany.mockResolvedValue({ count: 0 })
    expect((await move(req({ organizationId: 'o1' }), params)).status).toBe(400)
  })
})

describe('DELETE /api/vehicles/[id]/organization — out to the caller’s garage', () => {
  beforeEach(() => {
    vehicle.findUnique.mockResolvedValue(COMPANY)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isPro: true, isProComped: false })
    vehicle.count.mockResolvedValue(0)
  })

  it.each(['OWNER', 'FLEET_MANAGER'])('a %s takes it: becomes its owner, the slug cleared', async (role) => {
    roles({ o1: role })
    expect((await moveOut(req({}), params)).status).toBe(200)
    expect(vehicle.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', organizationId: 'o1' },
      data: { organizationId: null, ownerId: 'me', slug: null, keptEditableAt: null, siteId: null },
    })
  })

  it('its driver stops driving it, in the same transaction', async () => {
    roles({ o1: 'OWNER' })
    await moveOut(req({}), params)
    expect(prisma.vehicleAssignment.updateMany).toHaveBeenCalledWith({
      where: { endedAt: null, vehicleId: 'v1', vehicle: { organizationId: 'o1' } },
      data: { endedAt: expect.any(Date) },
    })
  })

  it.each(['MECHANIC', 'DRIVER'])('a %s cannot', async (role) => {
    roles({ o1: role })
    expect((await moveOut(req({}), params)).status).toBe(404)
    expect(vehicle.updateMany).not.toHaveBeenCalled()
  })

  it('a personal vehicle is not a company one', async () => {
    vehicle.findUnique.mockResolvedValue(PERSONAL)
    expect((await (await moveOut(req({}), params)).json()).code).toBe('vehicleNotCompany')
  })

  it('counts against the caller’s own free-tier limit', async () => {
    roles({ o1: 'OWNER' })
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ isPro: false, isProComped: false })
    vehicle.count.mockResolvedValue(1)
    const res = await moveOut(req({}), params)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('UPGRADE_REQUIRED')
    expect(vehicle.count).toHaveBeenCalledWith({ where: { ownerId: 'me', organizationId: null } })
    expect(vehicle.updateMany).not.toHaveBeenCalled()
  })

  it('moved or taken meanwhile: nothing changes', async () => {
    roles({ o1: 'OWNER' })
    vehicle.updateMany.mockResolvedValue({ count: 0 })
    expect((await moveOut(req({}), params)).status).toBe(400)
  })
})

describe('PATCH /api/vehicles/[id] on a company vehicle', () => {
  it('an organisation OWNER edits it', async () => {
    vehicle.findUnique.mockResolvedValue(COMPANY)
    vehicle.update.mockResolvedValue(COMPANY)
    roles({ o1: 'OWNER' })
    expect((await vehiclePatch(req({ engine: '1.5 dCi' }), params)).status).toBe(200)
  })

  it('it can never be made public', async () => {
    vehicle.findUnique.mockResolvedValue(COMPANY)
    roles({ o1: 'OWNER' })
    const res = await vehiclePatch(req({ isPublic: true }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('companyVehicleNotPublic')
    expect(vehicle.update).not.toHaveBeenCalled()
  })

  it('its account of record, no longer a member, is a stranger to it', async () => {
    vehicle.findUnique.mockResolvedValue({ ...COMPANY, ownerId: 'me' })
    expect((await vehiclePatch(req({ engine: 'x' }), params)).status).toBe(404)
    expect(vehicle.update).not.toHaveBeenCalled()
  })

  it.each(['MECHANIC', 'DRIVER'])('a %s cannot change its settings', async (role) => {
    vehicle.findUnique.mockResolvedValue(COMPANY)
    roles({ o1: role })
    expect((await vehiclePatch(req({ engine: 'x' }), params)).status).toBe(404)
    expect(vehicle.update).not.toHaveBeenCalled()
  })
})

describe('mail about a company vehicle', () => {
  /**
   * A company vehicle's ownerId names the account of record, who may have
   * left. The "a collaborator added a job" email must not go to them.
   */
  it('the collaborator-added-a-job email is not sent for a company vehicle', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/api/vehicles/[id]/tasks/route.ts'), 'utf8')
    expect(source).toContain("if (vehicle.access !== 'owner' && !vehicle.organizationId) {")
  })
})
