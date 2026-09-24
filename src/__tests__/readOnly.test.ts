import fs from 'fs'
import path from 'path'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    vehicle: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { overLimitIds } from '@/lib/plans'
import { isVehicleReadOnly, refuseIfReadOnly } from '@/lib/vehicleAllowance'
import { POST as createTask } from '@/app/api/vehicles/[id]/tasks/route'
import { PATCH as patchVehicle } from '@/app/api/vehicles/[id]/route'

const mockSession = getServerSession as jest.Mock
const mockUser = prisma.user.findUnique as jest.Mock
const mockVehicle = prisma.vehicle.findUnique as jest.Mock
const mockVehicles = prisma.vehicle.findMany as jest.Mock
const mockUpdate = prisma.vehicle.update as jest.Mock

const FREE = { isPro: false, isProComped: false, proPlan: null, grandfatheredAt: null }
const OLD = { id: 'old', createdAt: new Date('2025-01-01') }
const NEW = { id: 'new', createdAt: new Date('2026-05-01') }

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockResolvedValue({ user: { id: 'owner' } })
  mockUser.mockResolvedValue(FREE)
  mockVehicles.mockResolvedValue([NEW, OLD])
})

describe('which vehicles are over the allowance', () => {
  it('keeps the oldest writable and lists the rest', () => {
    const c = { id: 'c', createdAt: new Date('2026-06-01') }
    expect(overLimitIds([c, NEW, OLD], 1)).toEqual(['new', 'c'])
    expect(overLimitIds([c, NEW, OLD], 3)).toEqual([])
  })

  it('lists nothing without a cap', () => {
    expect(overLimitIds([NEW, OLD], null)).toEqual([])
  })

  it('breaks a tie on the same instant by id, so the answer never flips', () => {
    const at = new Date('2026-01-01')
    expect(overLimitIds([{ id: 'b', createdAt: at }, { id: 'a', createdAt: at }], 1)).toEqual(['b'])
  })
})

describe('the gate', () => {
  it('refuses a write to a vehicle over its owner’s allowance, naming why', async () => {
    const res = await refuseIfReadOnly({ id: 'new', ownerId: 'owner', organizationId: null })
    expect(res?.status).toBe(403)
    expect(await res?.json()).toMatchObject({ code: 'UPGRADE_REQUIRED' })
  })

  it('lets the oldest through', async () => {
    expect(await refuseIfReadOnly({ id: 'old', ownerId: 'owner', organizationId: null })).toBeNull()
  })

  it('lets everything through for a grandfathered account', async () => {
    mockUser.mockResolvedValue({ isPro: true, isProComped: false, proPlan: 'MONTHLY', grandfatheredAt: new Date() })
    expect(await isVehicleReadOnly({ id: 'new', ownerId: 'owner', organizationId: null })).toBe(false)
  })

  it('never applies to a company vehicle (slice 3 is the organisation’s plan)', async () => {
    expect(await isVehicleReadOnly({ id: 'new', ownerId: 'owner', organizationId: 'org1' })).toBe(false)
    expect(mockUser).not.toHaveBeenCalled()
  })
})

describe('on the routes', () => {
  const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never

  it('refuses a new job on a read-only vehicle', async () => {
    mockVehicle.mockResolvedValue({ id: 'new', ownerId: 'owner', organizationId: null })
    const res = await createTask(req({ title: 'Oil' }), { params: { id: 'new' } })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('UPGRADE_REQUIRED')
  })

  it('refuses editing the vehicle itself', async () => {
    mockVehicle.mockResolvedValue({ id: 'new', ownerId: 'owner', organizationId: null })
    const res = await patchVehicle(req({ make: 'Dacia' }), { params: { id: 'new' } })
    expect(res.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('still lets the owner take it off the public site', async () => {
    mockVehicle.mockResolvedValue({ id: 'new', ownerId: 'owner', organizationId: null, isPublic: true })
    mockUpdate.mockResolvedValue({ id: 'new', isPublic: false })
    const res = await patchVehicle(req({ isPublic: false }), { params: { id: 'new' } })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'new' }, data: { isPublic: false } })
  })

  it('does not let other edits ride along with unpublishing', async () => {
    mockVehicle.mockResolvedValue({ id: 'new', ownerId: 'owner', organizationId: null })
    const res = await patchVehicle(req({ isPublic: false, make: 'Dacia' }), { params: { id: 'new' } })
    expect(res.status).toBe(403)
  })
})

/**
 * Every write under a vehicle passes the gate, except the ways out of the
 * read-only state and the writes that are not about the vehicle's record.
 * A new write route fails here until it either calls refuseIfReadOnly or
 * is argued onto this list.
 */
describe('every write route under a vehicle is gated', () => {
  const EXEMPT = new Set([
    // Deleting it is a way back under the allowance.
    'route.ts DELETE',
    // Checked inside: only unpublishing is let through.
    'route.ts PATCH',
    // Moving it into an organisation takes it out of the count; moving
    // one out is a company vehicle, checked by the allowance instead.
    'organization/route.ts POST',
    'organization/route.ts DELETE',
    // Withdrawing a passport link never needs a plan.
    'passport-links/[linkId]/route.ts DELETE',
    // Following is the follower's, not the vehicle's record.
    'follow/route.ts POST',
    'follow/route.ts DELETE',
    // Taking someone's access away only narrows who sees it.
    'collaborators/[collabId]/route.ts DELETE',
  ])
  const root = path.join(process.cwd(), 'src', 'app', 'api', 'vehicles', '[id]')
  const handlers: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'route.ts') {
        const source = fs.readFileSync(full, 'utf8')
        for (const segment of source.split(/(?=^export async function )/m)) {
          const m = /^export async function (POST|PATCH|PUT|DELETE)\b/.exec(segment)
          if (!m) continue
          const key = `${path.relative(root, full).split(path.sep).join('/')} ${m[1]}`
          if (EXEMPT.has(key)) continue
          if (!segment.includes('refuseIfReadOnly(')) handlers.push(key)
        }
      }
    }
  }

  it('finds no ungated write', () => {
    walk(root)
    expect(handlers).toEqual([])
  })

  it('has an exempt list that still names real handlers', () => {
    for (const key of EXEMPT) {
      const [file, method] = key.split(' ')
      const source = fs.readFileSync(path.join(root, file), 'utf8')
      expect({ key, found: source.includes(`export async function ${method}`) }).toEqual({ key, found: true })
    }
  })
})
