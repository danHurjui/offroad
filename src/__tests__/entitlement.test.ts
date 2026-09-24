import fs from 'fs'
import path from 'path'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    organization: { findUnique: jest.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { vehicleHasPro } from '@/lib/entitlement'
import { orgHasPaidFeatures } from '@/lib/plans'

const user = prisma.user.findUnique as jest.Mock
const org = prisma.organization.findUnique as jest.Mock

beforeEach(() => jest.clearAllMocks())

/**
 * RL-042 slice 3b (#54): paid features on a company vehicle come from the
 * organisation's plan — "entitlement resolves through the organisation for
 * org-owned vehicles".
 */
describe('vehicleHasPro', () => {
  it('reads a personal vehicle’s owner', async () => {
    user.mockResolvedValue({ isPro: false, isProComped: true })
    expect(await vehicleHasPro({ ownerId: 'me', organizationId: null })).toBe(true)
    expect(user).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'me' } }))
    expect(org).not.toHaveBeenCalled()
  })

  it('reads a company vehicle’s organisation, never the account of record', async () => {
    org.mockResolvedValue({ plan: 'BUSINESS_MONTHLY', compedAt: null })
    expect(await vehicleHasPro({ ownerId: 'someone', organizationId: 'o1' })).toBe(true)
    expect(user).not.toHaveBeenCalled()
  })

  it('gives nothing on a company vehicle of an organisation that does not pay', async () => {
    org.mockResolvedValue({ plan: null, compedAt: null })
    expect(await vehicleHasPro({ ownerId: 'pays-for-personal', organizationId: 'o1' })).toBe(false)
    expect(user).not.toHaveBeenCalled()
  })

  it('gives everything in a comped (beta) organisation', () => {
    expect(orgHasPaidFeatures({ plan: null, compedAt: new Date() })).toBe(true)
    expect(orgHasPaidFeatures({ plan: 'FLEET_100_ANNUAL', compedAt: null })).toBe(true)
    expect(orgHasPaidFeatures({ plan: null, compedAt: null })).toBe(false)
    expect(orgHasPaidFeatures(null)).toBe(false)
  })
})

/**
 * Every gate under a vehicle asks `vehicleHasPro()`. One that reads a plan
 * itself — the caller's, or the account of record's — is the failure this
 * module exists to prevent: a manager's personal plan unlocking a company
 * that does not pay, or a collaborator's lack of one capping the owner's.
 */
describe('every vehicle gate goes through vehicleHasPro()', () => {
  const roots = [
    path.join(process.cwd(), 'src', 'app', 'api', 'vehicles', '[id]'),
    path.join(process.cwd(), 'src', 'app', 'dashboard', 'vehicles', '[id]'),
  ]
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry.name)) files.push(full)
    }
  }
  roots.forEach(walk)

  it('finds no vehicle screen or route reading PRO_SELECT or hasPro() itself', () => {
    const offenders = files.filter((f) => /PRO_SELECT|hasPro\(/.test(fs.readFileSync(f, 'utf8')))
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([])
  })

  it('covers the trip sheet too', () => {
    const trips = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'tripRecords.ts'), 'utf8')
    expect(trips).toMatch(/vehicleHasPro\(vehicle\)/)
    expect(trips).not.toMatch(/PRO_SELECT/)
  })
})
