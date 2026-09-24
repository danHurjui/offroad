jest.mock('@/i18n/requestLocale', () => ({ localeFromRequest: () => 'en' }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
// The read-only gate reads the plan and vehicles, which these mocks do not
// model; readOnly.test.ts tests it on its own.
jest.mock('@/lib/vehicleAllowance', () => ({
  ...jest.requireActual('@/lib/vehicleAllowance'),
  refuseIfReadOnly: jest.fn(async () => null),
}))
jest.mock('@/lib/rateLimit', () => ({ ...jest.requireActual('@/lib/rateLimit'), consumeRateLimit: jest.fn() }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    organizationSite: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    vehicle: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
  },
}))

import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rateLimit'
import { normalizeSiteName, pickSite, siteVehicleWhere, SITE_NAME_MAX, ORG_SITE_LIMIT } from '@/lib/sites'
import { GET as listSites, POST as createSite } from '@/app/api/organizations/[orgId]/sites/route'
import { PATCH as renameSite, DELETE as deleteSite } from '@/app/api/organizations/[orgId]/sites/[siteId]/route'
import { PATCH as patchVehicle } from '@/app/api/vehicles/[id]/route'
import { GET as tripsReport } from '@/app/api/organizations/[orgId]/reports/trips/route'

const mockMember = prisma.organizationMember.findUnique as jest.Mock
const site = prisma.organizationSite as unknown as Record<string, jest.Mock>
const ORG = { id: 'org1', name: 'Transport SRL' }
const body = (b: unknown) => ({ json: () => Promise.resolve(b) }) as never
const orgParams = { params: { orgId: 'org1' } }
const siteParams = { params: { orgId: 'org1', siteId: 's1' } }

beforeEach(() => {
  jest.clearAllMocks()
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ active: true, isAdmin: false })
  ;(consumeRateLimit as jest.Mock).mockResolvedValue({ ok: true, remaining: 10, retryAfterSeconds: 0 })
  mockMember.mockResolvedValue({ id: 'm1', role: 'FLEET_MANAGER', organization: ORG })
  site.findUnique.mockResolvedValue({ id: 's1', name: 'Cluj', organizationId: 'org1' })
})

describe('the rules', () => {
  it('stores a name trimmed with single spaces, within the limit', () => {
    expect(normalizeSiteName('  Depozit   Cluj ')).toBe('Depozit Cluj')
    expect(normalizeSiteName('')).toBe(false)
    expect(normalizeSiteName('   ')).toBe(false)
    expect(normalizeSiteName('x'.repeat(SITE_NAME_MAX + 1))).toBe(false)
    expect(normalizeSiteName(42)).toBe(false)
  })

  it('a filter naming no site of the organisation means the whole organisation', () => {
    const sites = [{ id: 's1', name: 'Cluj' }]
    expect(pickSite(sites, 's1')).toEqual(sites[0])
    expect(pickSite(sites, 'someone-elses')).toBeNull()
    expect(pickSite(sites, undefined)).toBeNull()
    expect(siteVehicleWhere(null)).toEqual({})
    expect(siteVehicleWhere(sites[0])).toEqual({ siteId: 's1' })
  })
})

describe('who manages sites', () => {
  it('is a 404 to someone outside the organisation', async () => {
    mockMember.mockResolvedValue(null)
    expect((await listSites({} as never, orgParams)).status).toBe(404)
    expect((await createSite(body({ name: 'Cluj' }), orgParams)).status).toBe(404)
    expect(site.create).not.toHaveBeenCalled()
  })

  it.each(['MECHANIC', 'DRIVER'])('is a 404 to a %s', async (role) => {
    mockMember.mockResolvedValue({ id: 'm1', role, organization: ORG })
    expect((await createSite(body({ name: 'Cluj' }), orgParams)).status).toBe(404)
    expect((await renameSite(body({ name: 'Iași' }), siteParams)).status).toBe(404)
    expect((await deleteSite({} as never, siteParams)).status).toBe(404)
    expect(site.create).not.toHaveBeenCalled()
    expect(site.delete).not.toHaveBeenCalled()
  })

  it.each(['OWNER', 'FLEET_MANAGER'])('a %s creates one, rate-limited per user id', async (role) => {
    mockMember.mockResolvedValue({ id: 'm1', role, organization: ORG })
    site.count.mockResolvedValue(0)
    site.create.mockResolvedValue({ id: 's2', name: 'Depozit Cluj' })
    const res = await createSite(body({ name: ' Depozit  Cluj ' }), orgParams)
    expect(res.status).toBe(201)
    expect(site.create).toHaveBeenCalledWith(expect.objectContaining({ data: { organizationId: 'org1', name: 'Depozit Cluj' } }))
    expect(consumeRateLimit).toHaveBeenCalledWith('orgSite', 'user:u1')
  })

  it('refuses a blank name, a taken name, and one past the limit', async () => {
    site.count.mockResolvedValue(0)
    expect((await createSite(body({ name: '  ' }), orgParams)).status).toBe(400)
    site.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
    const taken = await createSite(body({ name: 'Cluj' }), orgParams)
    expect(taken.status).toBe(409)
    expect((await taken.json()).code).toBe('siteNameTaken')
    site.count.mockResolvedValue(ORG_SITE_LIMIT)
    expect((await createSite(body({ name: 'Brașov' }), orgParams)).status).toBe(409)
  })
})

describe('renaming and deleting', () => {
  it('never touches another organisation’s site', async () => {
    site.findUnique.mockResolvedValue({ id: 's1', organizationId: 'other' })
    expect((await renameSite(body({ name: 'Mine now' }), siteParams)).status).toBe(404)
    expect((await deleteSite({} as never, siteParams)).status).toBe(404)
    expect(site.update).not.toHaveBeenCalled()
    expect(site.delete).not.toHaveBeenCalled()
  })

  it('renames one of its own', async () => {
    site.update.mockResolvedValue({ id: 's1', name: 'Cluj Nord' })
    expect((await renameSite(body({ name: 'Cluj Nord' }), siteParams)).status).toBe(200)
    expect(site.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1' }, data: { name: 'Cluj Nord' } }))
  })

  it('deletes only the site: its vehicles are unassigned by the foreign key, never deleted', async () => {
    site.delete.mockResolvedValue({})
    expect((await deleteSite({} as never, siteParams)).status).toBe(200)
    expect(site.delete).toHaveBeenCalledWith({ where: { id: 's1' } })
    expect(prisma.vehicle.update).not.toHaveBeenCalled()
    const schema = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    expect(schema).toMatch(/site\s+OrganizationSite\?\s+@relation\(fields: \[siteId\], references: \[id\], onDelete: SetNull\)/)
  })
})

describe('putting a vehicle at a site (vehicle PATCH)', () => {
  const company = { id: 'v1', ownerId: 'someone', organizationId: 'org1', projectType: 'DAILY_DRIVER', slug: null, year: 2020, make: 'Dacia', model: 'Logan' }

  beforeEach(() => {
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue(company)
    ;(prisma.vehicle.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ ...company, ...data }))
  })

  it('accepts one of the vehicle’s own organisation’s sites', async () => {
    expect((await patchVehicle(body({ siteId: 's1' }), { params: { id: 'v1' } })).status).toBe(200)
    expect(prisma.vehicle.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { siteId: 's1' } })
  })

  it('refuses another organisation’s site', async () => {
    site.findUnique.mockResolvedValue({ organizationId: 'other' })
    const res = await patchVehicle(body({ siteId: 's9' }), { params: { id: 'v1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('siteNotInOrganization')
    expect(prisma.vehicle.update).not.toHaveBeenCalled()
  })

  it('refuses any site for a personal vehicle', async () => {
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ ...company, ownerId: 'u1', organizationId: null })
    expect((await patchVehicle(body({ siteId: 's1' }), { params: { id: 'v1' } })).status).toBe(400)
    expect(prisma.vehicle.update).not.toHaveBeenCalled()
  })

  it('clears the site on an empty value', async () => {
    expect((await patchVehicle(body({ siteId: '' }), { params: { id: 'v1' } })).status).toBe(200)
    expect(prisma.vehicle.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { siteId: null } })
  })
})

describe('the fleet trip sheet', () => {
  it('refuses a site that is not this organisation’s', async () => {
    site.findUnique.mockResolvedValue({ id: 's9', name: 'Theirs', organizationId: 'other' })
    const res = await tripsReport(new NextRequest('http://localhost/api/organizations/org1/reports/trips?month=2026-03&site=s9'), orgParams)
    expect(res.status).toBe(404)
    expect(prisma.vehicle.findMany).not.toHaveBeenCalled()
  })
})

describe('every fleet page narrows by site on the server', () => {
  const pages = ['fleet/page.tsx', 'fleet/costs/page.tsx', 'fleet/trips/page.tsx', 'fleet/reports/page.tsx']
  it.each(pages)('%s', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/app/dashboard/organizations/[orgId]', file), 'utf8')
    expect(source).toMatch(/organizationId: org\.id, \.\.\.siteVehicleWhere\(site\)/)
    // Every vehicle within the site, never a page of them.
    expect(source).not.toMatch(/take:/)
  })
})
