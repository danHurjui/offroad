jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    vehicleAssignment: { findFirst: jest.fn() },
  },
}))

import fs from 'fs'
import path from 'path'
import { prisma } from '@/lib/prisma'
import { requireVehicleAccess, requireVehicleOwner } from '@/lib/access'

/**
 * RL-038 slice 3: who may do what to a vehicle, now that a vehicle can
 * belong to an organisation. Every vehicle route goes through these two
 * functions, so this table is the permission model of the whole app.
 *
 * `owner` = everything the owner of a personal vehicle can do (settings,
 * deleting, inviting, costs). `collaborator` = read, add their own entries.
 */

const vehicleFind = prisma.vehicle.findUnique as jest.Mock
const collaboratorFind = prisma.projectCollaborator.findFirst as jest.Mock
const memberFind = prisma.organizationMember.findUnique as jest.Mock
const assignmentFind = prisma.vehicleAssignment.findFirst as jest.Mock

const PERSONAL = { id: 'v1', ownerId: 'alice', organizationId: null }
/** A company vehicle whose account of record is `alice`. */
const COMPANY = { id: 'v2', ownerId: 'alice', organizationId: 'o1' }

type Case = {
  name: string
  vehicle: typeof PERSONAL | typeof COMPANY
  user: string
  membership?: string | null
  collaborator?: boolean
  /** An active assignment of this user to this vehicle (RL-040). */
  assigned?: boolean
  expected: 'owner' | 'collaborator' | 'driver' | null
}

const cases: Case[] = [
  // Personal vehicles: exactly as before this slice.
  { name: 'personal: the owner', vehicle: PERSONAL, user: 'alice', expected: 'owner' },
  { name: 'personal: an active collaborator', vehicle: PERSONAL, user: 'bob', collaborator: true, expected: 'collaborator' },
  { name: 'personal: a stranger', vehicle: PERSONAL, user: 'eve', expected: null },
  { name: 'personal: membership of some organisation is irrelevant', vehicle: PERSONAL, user: 'bob', membership: 'OWNER', expected: null },
  // Company vehicles: membership decides.
  { name: 'company: an OWNER', vehicle: COMPANY, user: 'carol', membership: 'OWNER', expected: 'owner' },
  { name: 'company: a FLEET_MANAGER', vehicle: COMPANY, user: 'carol', membership: 'FLEET_MANAGER', expected: 'owner' },
  { name: 'company: a MECHANIC', vehicle: COMPANY, user: 'dan', membership: 'MECHANIC', expected: 'collaborator' },
  // RL-040: a driver reaches only the vehicle they are assigned to now.
  { name: 'company: a DRIVER assigned to it', vehicle: COMPANY, user: 'dan', membership: 'DRIVER', assigned: true, expected: 'driver' },
  { name: 'company: a DRIVER not assigned to it', vehicle: COMPANY, user: 'dan', membership: 'DRIVER', expected: null },
  { name: 'company: a DRIVER not assigned but invited to it directly', vehicle: COMPANY, user: 'dan', membership: 'DRIVER', collaborator: true, expected: 'collaborator' },
  { name: 'personal: an assignment means nothing without membership', vehicle: PERSONAL, user: 'dan', assigned: true, expected: null },
  { name: 'company: an outside collaborator invited to it', vehicle: COMPANY, user: 'bob', collaborator: true, expected: 'collaborator' },
  { name: 'company: a stranger', vehicle: COMPANY, user: 'eve', expected: null },
  // The account of record is not an owner by being named on the row.
  { name: 'company: the account of record, no longer a member', vehicle: COMPANY, user: 'alice', expected: null },
  { name: 'company: the account of record, now an unassigned DRIVER', vehicle: COMPANY, user: 'alice', membership: 'DRIVER', expected: null },
  { name: 'company: the account of record, still a FLEET_MANAGER', vehicle: COMPANY, user: 'alice', membership: 'FLEET_MANAGER', expected: 'owner' },
]

beforeEach(() => {
  jest.clearAllMocks()
})

describe.each(cases)('$name', ({ vehicle, user, membership, collaborator, assigned, expected }) => {
  beforeEach(() => {
    vehicleFind.mockResolvedValue(vehicle)
    memberFind.mockImplementation(({ where }: { where: { organizationId_userId: { organizationId: string; userId: string } } }) =>
      Promise.resolve(
        membership && where.organizationId_userId.organizationId === 'o1' && where.organizationId_userId.userId === user
          ? { role: membership }
          : null
      )
    )
    collaboratorFind.mockResolvedValue(collaborator ? { id: 'c1' } : null)
    assignmentFind.mockImplementation(({ where }: { where: { vehicleId: string; driverUserId: string; endedAt: null } }) =>
      Promise.resolve(assigned && where.vehicleId === vehicle.id && where.driverUserId === user && where.endedAt === null ? { id: 'a1' } : null)
    )
  })

  it(`requireVehicleAccess → ${expected ?? 'refused'}`, async () => {
    const result = await requireVehicleAccess(vehicle.id, user)
    expect(result?.access ?? null).toBe(expected)
  })

  it(`requireVehicleOwner → ${expected === 'owner' ? 'allowed' : 'refused'}`, async () => {
    const result = await requireVehicleOwner(vehicle.id, user)
    expect(result !== null).toBe(expected === 'owner')
  })
})

describe('reading membership, not the token', () => {
  /**
   * A removed member loses access on their next request: membership is
   * read from the database on every call, never from the session, so
   * there is no 60-second token window for this at all.
   */
  it('asks the database on every call', async () => {
    vehicleFind.mockResolvedValue(COMPANY)
    memberFind.mockResolvedValueOnce({ role: 'OWNER' }).mockResolvedValueOnce(null)
    collaboratorFind.mockResolvedValue(null)
    expect((await requireVehicleAccess('v2', 'carol'))?.access).toBe('owner')
    expect(await requireVehicleAccess('v2', 'carol')).toBeNull()
  })

  it('a missing vehicle is null for everyone', async () => {
    vehicleFind.mockResolvedValue(null)
    expect(await requireVehicleAccess('nope', 'alice')).toBeNull()
    expect(await requireVehicleOwner('nope', 'alice')).toBeNull()
  })
})

/**
 * The model only holds if nothing decides ownership by comparing
 * `ownerId` with the person asking — for a company vehicle that names the
 * account of record, who may since have been removed. Every such check
 * reads `vehicle.access` from the functions above instead.
 */
describe('nothing outside access.ts decides ownership from ownerId', () => {
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(full)
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : []
    })
  }

  const comparison = /ownerId\s*[!=]==?\s*(session\.user\.id|userId|viewerId)\b|(session\.user\.id|userId|viewerId)\s*[!=]==?\s*\w+\.ownerId\b/

  it('finds no comparison of ownerId with the caller', () => {
    const offenders = sources(path.join(process.cwd(), 'src'))
      .filter((file) => !file.endsWith(path.join('lib', 'access.ts')))
      .flatMap((file) =>
        fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => ({ line, at: `${path.relative(process.cwd(), file)}:${i + 1}` }))
          .filter(({ line }) => comparison.test(line))
          .map(({ at }) => at)
      )
    expect(offenders).toEqual([])
  })
})
