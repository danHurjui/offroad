// RL-042: the read-only gate reads the owner's plan and vehicles, which
// these mocks do not model; readOnly.test.ts tests it on its own.
jest.mock('@/lib/vehicleAllowance', () => ({
  ...jest.requireActual('@/lib/vehicleAllowance'),
  refuseIfReadOnly: jest.fn(async () => null),
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    vehicleAssignment: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    odometerReading: { findMany: jest.fn(), create: jest.fn() },
    assignmentPhoto: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/storage', () => ({
  ...jest.requireActual('@/lib/storage'),
  saveUpload: jest.fn(async () => 'record/v1/photo.jpg'),
}))

import fs from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET as list, POST as assign } from '@/app/api/vehicles/[id]/assignments/route'
import { POST as end } from '@/app/api/vehicles/[id]/assignments/[assignmentId]/end/route'
import { POST as start } from '@/app/api/vehicles/[id]/assignments/[assignmentId]/start/route'
import { POST as photo } from '@/app/api/vehicles/[id]/assignments/[assignmentId]/photos/route'
import { PROJECT_TYPE_CONFIG, PROJECT_TYPES } from '@/lib/projectType'

const session = getServerSession as jest.Mock
const vehicleFind = prisma.vehicle.findUnique as jest.Mock
const memberFind = prisma.organizationMember.findUnique as jest.Mock
const a = prisma.vehicleAssignment as unknown as Record<string, jest.Mock>
const readings = prisma.odometerReading as unknown as Record<string, jest.Mock>
const noBody = { json: () => Promise.reject(new Error('no body')) } as never
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
  ;(prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
  readings.findMany.mockResolvedValue([])
  readings.create.mockResolvedValue({ id: 'r-new' })
  members({ boss: 'FLEET_MANAGER', dan: 'DRIVER', mech: 'MECHANIC' })
  as('boss')
})

describe('assigning', () => {
  it('a manager assigns a DRIVER of the organisation, from now', async () => {
    a.create.mockResolvedValue({ id: 'a1' })
    expect((await assign(req({ driverUserId: 'dan', note: ' Day shift ' }), params)).status).toBe(201)
    expect(a.create).toHaveBeenCalledWith({ data: { vehicleId: 'v1', driverUserId: 'dan', note: 'Day shift', assignedByUserId: 'boss', startReadingId: null } })
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
    expect((await end(noBody, endParams)).status).toBe(200)
    expect(a.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', endedAt: null }, data: { endedAt: expect.any(Date), endReadingId: null } })
  })

  it('a manager ends anyone’s; ending twice changes nothing', async () => {
    a.findUnique.mockResolvedValue(ACTIVE)
    expect((await end(noBody, endParams)).status).toBe(200)
    a.updateMany.mockResolvedValue({ count: 0 })
    expect((await (await end(noBody, endParams)).json()).code).toBe('assignmentAlreadyEnded')
  })

  it('a mechanic cannot end a driver’s assignment', async () => {
    as('mech')
    a.findUnique.mockResolvedValue(ACTIVE)
    expect((await end(noBody, endParams)).status).toBe(404)
    expect(a.updateMany).not.toHaveBeenCalled()
  })

  it('an assignment of another vehicle is a 404', async () => {
    a.findUnique.mockResolvedValue({ ...ACTIVE, vehicleId: 'v9' })
    expect((await end(noBody, endParams)).status).toBe(404)
  })
})

describe('handover', () => {
  const ACTIVE = { id: 'a1', vehicleId: 'v1', driverUserId: 'dan', endedAt: null, startReadingId: null, photos: [] }
  const asDriver = () => {
    as('dan')
    a.findFirst.mockResolvedValue({ id: 'a1' })
    a.findUnique.mockResolvedValue(ACTIVE)
  }

  it('the km at assignment goes into the mileage history, in the same transaction', async () => {
    a.create.mockResolvedValue({ id: 'a1' })
    expect((await assign(req({ driverUserId: 'dan', km: '120500' }), params)).status).toBe(201)
    expect(readings.create).toHaveBeenCalledWith({
      data: { vehicleId: 'v1', km: 120500, readAt: expect.any(Date), source: 'HANDOVER', createdByUserId: 'boss' },
    })
    expect(a.create.mock.calls[0][0].data.startReadingId).toBe('r-new')
  })

  it('a km below the history is refused with the reading it collides with', async () => {
    readings.findMany.mockResolvedValue([{ id: 'r0', km: 130000, readAt: new Date('2026-01-01'), isOverride: false, createdAt: new Date('2026-01-01') }])
    const res = await assign(req({ driverUserId: 'dan', km: 120000 }), params)
    expect(res.status).toBe(409)
    expect(a.create).not.toHaveBeenCalled()
  })

  it('handing back records the end km with the end', async () => {
    asDriver()
    expect((await end(req({ km: 121000 }), endParams)).status).toBe(200)
    expect(a.updateMany.mock.calls[0][0]).toEqual({ where: { id: 'a1', endedAt: null }, data: { endedAt: expect.any(Date), endReadingId: 'r-new' } })
  })

  it('ending twice rolls the second km back rather than recording it', async () => {
    asDriver()
    a.updateMany.mockResolvedValue({ count: 0 })
    let rolledBack = false
    ;(prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof prisma) => unknown) => {
      try {
        return await fn(prisma)
      } catch (e) {
        rolledBack = true
        throw e
      }
    })
    expect((await (await end(req({ km: 121000 }), endParams)).json()).code).toBe('assignmentAlreadyEnded')
    expect(rolledBack).toBe(true)
  })

  it('the start km is recorded once, by the driver, while active', async () => {
    asDriver()
    expect((await start(req({ km: 120500 }), endParams)).status).toBe(200)
    expect(a.updateMany.mock.calls[0][0].where).toEqual({ id: 'a1', endedAt: null, startReadingId: null })
    a.updateMany.mockResolvedValue({ count: 0 })
    expect((await (await start(req({ km: 120600 }), endParams)).json()).code).toBe('handoverStartRecorded')
    expect((await start(req({}), endParams)).status).toBe(400) // a km is the point
  })

  describe('condition photos', () => {
    const file = (type = 'image/jpeg') => new File([new Uint8Array([1, 2, 3])], 'p.jpg', { type })
    const upload = (fields: Record<string, string | File>) => {
      const form = new FormData()
      for (const [k, v] of Object.entries(fields)) form.append(k, v)
      return photo({ formData: () => Promise.resolve(form) } as never, endParams)
    }

    it('the driver adds one while the assignment is active', async () => {
      asDriver()
      ;(prisma.assignmentPhoto.create as jest.Mock).mockResolvedValue({ id: 'p1' })
      expect((await upload({ stage: 'END', file: file() })).status).toBe(201)
      expect(prisma.assignmentPhoto.create).toHaveBeenCalledWith({ data: { assignmentId: 'a1', stage: 'END', url: 'record/v1/photo.jpg' } })
    })

    it('not after it ended, not for another driver’s assignment, not without a stage', async () => {
      asDriver()
      a.findUnique.mockResolvedValue({ ...ACTIVE, endedAt: new Date() })
      expect((await upload({ stage: 'END', file: file() })).status).toBe(400)
      a.findUnique.mockResolvedValue({ ...ACTIVE, driverUserId: 'someone-else' })
      expect((await upload({ stage: 'END', file: file() })).status).toBe(404)
      a.findUnique.mockResolvedValue(ACTIVE)
      expect((await (await upload({ stage: 'MIDDLE', file: file() })).json()).code).toBe('handoverStageInvalid')
      expect(prisma.assignmentPhoto.create).not.toHaveBeenCalled()
    })

    it('six per end, images only', async () => {
      asDriver()
      a.findUnique.mockResolvedValue({ ...ACTIVE, photos: Array.from({ length: 6 }, () => ({ stage: 'END' })) })
      expect((await (await upload({ stage: 'END', file: file() })).json()).code).toBe('handoverPhotoLimit')
      a.findUnique.mockResolvedValue(ACTIVE)
      expect((await (await upload({ stage: 'START', file: file('application/pdf') })).json()).code).toBe('unsupportedFileType')
    })
  })
})

describe('defects', () => {
  /** A defect must read as needing attention on the manager's garage. */
  it.each(PROJECT_TYPES)('%s: the defect status is warn/danger and every value is in its vocabulary', (mode) => {
    const config = PROJECT_TYPE_CONFIG[mode]
    if (!config.defect) return
    const tone = config.statusTags.find((s) => s.value === config.defect!.status)?.tone
    expect(['warn', 'danger']).toContain(tone)
    expect(config.categories.map((c) => c.value)).toContain(config.defect.category)
    expect(config.photoTypes.map((p) => p.value)).toContain(config.defect.photoType)
  })

  it('a restoration has nothing to report', () => {
    expect(PROJECT_TYPE_CONFIG.RESTORATION.defect).toBeNull()
  })

  it('goes through the ordinary job route, not a second kind of record', () => {
    const form = fs.readFileSync(path.join(process.cwd(), 'src/components/DefectReportForm.tsx'), 'utf8')
    expect(form).toContain('`/api/vehicles/${vehicleId}/tasks`')
    expect(form).not.toMatch(/costRon/)
  })
})
