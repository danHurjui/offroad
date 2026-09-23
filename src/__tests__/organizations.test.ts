jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    organization: { create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
    organizationMember: { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), update: jest.fn(), delete: jest.fn() },
    vehicle: { findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/rateLimit', () => {
  const actual = jest.requireActual('@/lib/rateLimit')
  return { ...actual, consumeRateLimit: jest.fn() }
})
jest.mock('@/lib/personalData', () => ({ collectStorageKeys: jest.fn(), deleteStoredFiles: jest.fn() }))

import fs from 'fs'
import path from 'path'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rateLimit'
import { collectStorageKeys, deleteStoredFiles } from '@/lib/personalData'
import {
  canManageOrganization,
  lastOwnerBlocks,
  normalizeCui,
  organizationsOnAccountDeletion,
  parseOrganization,
} from '@/lib/organizations'
import { GET as listOrgs, POST as createOrg } from '@/app/api/organizations/route'
import { GET as getOrg, PATCH as patchOrg, DELETE as deleteOrg } from '@/app/api/organizations/[orgId]/route'
import { PATCH as patchMember, DELETE as deleteMember } from '@/app/api/organizations/[orgId]/members/[memberId]/route'
import { PATCH as adminPatchUser } from '@/app/api/admin/users/[userId]/route'
import { DELETE as deleteAccount } from '@/app/api/me/account/route'

const mockSession = getServerSession as jest.Mock
const user = prisma.user as unknown as Record<string, jest.Mock>
const org = prisma.organization as unknown as Record<string, jest.Mock>
const member = prisma.organizationMember as unknown as Record<string, jest.Mock>
const vehicle = prisma.vehicle as unknown as Record<string, jest.Mock>

const req = (body?: unknown) =>
  ({ json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)) }) as never
const orgParams = { params: { orgId: 'o1' } }
const memberParams = (memberId: string) => ({ params: { orgId: 'o1', memberId } })

const ORG = { id: 'o1', name: 'Transport SRL', cui: 'RO14399840', billingAddress: null }
/** The caller's own membership, as loadMembership reads it. */
function callerIs(role: string, id = 'm-me') {
  member.findUnique.mockImplementation((args: { where: { id?: string } }) =>
    args.where.id !== undefined ? Promise.resolve(targets[args.where.id] ?? null) : Promise.resolve({ id, organizationId: 'o1', userId: 'me', role, organization: ORG })
  )
}
let targets: Record<string, { id: string; organizationId: string; userId: string; role: string }> = {}

beforeEach(() => {
  jest.clearAllMocks()
  targets = {}
  mockSession.mockResolvedValue({ user: { id: 'me', active: true } })
  ;(consumeRateLimit as jest.Mock).mockResolvedValue({ ok: true })
  ;(prisma.$transaction as jest.Mock).mockImplementation((arg: unknown) =>
    typeof arg === 'function' ? (arg as (tx: typeof prisma) => unknown)(prisma) : Promise.all(arg as unknown[])
  )
  ;(prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'o1' }])
  member.findMany.mockResolvedValue([])
  vehicle.findMany.mockResolvedValue([])
  vehicle.count.mockResolvedValue(0)
})

describe('normalizeCui', () => {
  it('accepts a code whose check digit is right, with or without RO', () => {
    expect(normalizeCui('14399840')).toBe('14399840')
    expect(normalizeCui('ro 14 399 840')).toBe('RO14399840')
  })

  it('refuses a wrong check digit — a typo, not a lookup', () => {
    expect(normalizeCui('14399841')).toBeNull()
  })

  it('refuses anything that is not digits after the prefix', () => {
    for (const bad of ['', 'RO', 'ABC123', '1', '12345678901', 'DE14399840']) expect(normalizeCui(bad)).toBeNull()
  })
})

describe('parseOrganization', () => {
  it('requires a name on create', () => {
    expect(parseOrganization({}, { create: true })).toEqual({ ok: false, field: 'name' })
    expect(parseOrganization({ name: '   ' }, { create: true })).toEqual({ ok: false, field: 'name' })
    expect(parseOrganization({ name: 'x'.repeat(121) }, { create: true })).toEqual({ ok: false, field: 'name' })
  })

  it('returns only the fields sent on an edit, and blanks clear', () => {
    expect(parseOrganization({ cui: '' }, { create: false })).toEqual({ ok: true, data: { cui: null } })
    expect(parseOrganization({ billingAddress: ' Str. X 1 ' }, { create: false })).toEqual({ ok: true, data: { billingAddress: 'Str. X 1' } })
  })

  it('names the CUI when its check digit is wrong', () => {
    expect(parseOrganization({ name: 'A', cui: '14399841' }, { create: true })).toEqual({ ok: false, field: 'cui' })
  })
})

describe('roles', () => {
  it('only an owner runs the organisation', () => {
    expect(canManageOrganization('OWNER')).toBe(true)
    for (const r of ['FLEET_MANAGER', 'MECHANIC', 'DRIVER'] as const) expect(canManageOrganization(r)).toBe(false)
  })

  it('the last owner cannot be demoted or removed', () => {
    expect(lastOwnerBlocks({ role: 'OWNER' }, { kind: 'role', role: 'DRIVER' }, 1)).toBe(true)
    expect(lastOwnerBlocks({ role: 'OWNER' }, { kind: 'remove' }, 1)).toBe(true)
    expect(lastOwnerBlocks({ role: 'OWNER' }, { kind: 'role', role: 'OWNER' }, 1)).toBe(false)
    expect(lastOwnerBlocks({ role: 'OWNER' }, { kind: 'remove' }, 2)).toBe(false)
    expect(lastOwnerBlocks({ role: 'DRIVER' }, { kind: 'remove' }, 1)).toBe(false)
  })
})

describe('organizationsOnAccountDeletion', () => {
  const m = (role: 'OWNER' | 'DRIVER', id: string, others: Array<'OWNER' | 'DRIVER'>) => ({
    role,
    organization: { id, name: id, members: [{ role }, ...others.map((r) => ({ role: r }))] },
  })

  it('an organisation with nobody else in it goes with the account', () => {
    expect(organizationsOnAccountDeletion([m('OWNER', 'solo', [])])).toEqual({ solo: ['solo'], blocking: [] })
  })

  it('the last owner of an organisation others are in blocks the deletion', () => {
    expect(organizationsOnAccountDeletion([m('OWNER', 'acme', ['DRIVER'])]).blocking).toEqual([{ id: 'acme', name: 'acme' }])
  })

  it('a member, or one of several owners, just leaves', () => {
    expect(organizationsOnAccountDeletion([m('DRIVER', 'a', ['OWNER']), m('OWNER', 'b', ['OWNER'])])).toEqual({ solo: [], blocking: [] })
  })
})

describe('POST /api/organizations', () => {
  it('is refused outside the closed beta, before anything else', async () => {
    user.findUnique.mockResolvedValue({ orgBetaAt: null })
    const res = await createOrg(req({ name: 'Transport SRL' }))
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('orgBetaRequired')
    expect(consumeRateLimit).not.toHaveBeenCalled()
    expect(org.create).not.toHaveBeenCalled()
  })

  it('creates it with the caller as its first owner, rate-limited by user id', async () => {
    user.findUnique.mockResolvedValue({ orgBetaAt: new Date() })
    org.create.mockResolvedValue({ id: 'o1', name: 'Transport SRL' })
    const res = await createOrg(req({ name: ' Transport SRL ', cui: 'RO 14399840' }))
    expect(res.status).toBe(201)
    expect(consumeRateLimit).toHaveBeenCalledWith('orgCreate', 'user:me')
    expect(org.create).toHaveBeenCalledWith({
      data: {
        name: 'Transport SRL',
        cui: 'RO14399840',
        billingAddress: null,
        members: { create: { userId: 'me', role: 'OWNER' } },
      },
    })
  })

  it('stops at the rate limit', async () => {
    user.findUnique.mockResolvedValue({ orgBetaAt: new Date() })
    ;(consumeRateLimit as jest.Mock).mockResolvedValue({ ok: false, retryAfterSeconds: 60 })
    expect((await createOrg(req({ name: 'A' }))).status).toBe(429)
    expect(org.create).not.toHaveBeenCalled()
  })

  it('names the field it refuses', async () => {
    user.findUnique.mockResolvedValue({ orgBetaAt: new Date() })
    const res = await createOrg(req({ name: 'A', cui: '123' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('orgFieldInvalid')
  })
})

describe('GET /api/organizations', () => {
  it('lists only the caller’s memberships', async () => {
    member.findMany.mockResolvedValue([{ role: 'DRIVER', organization: { id: 'o1', name: 'A', _count: { members: 3 } } }])
    const res = await listOrgs()
    expect(member.findMany.mock.calls[0][0].where).toEqual({ userId: 'me' })
    expect(await res.json()).toEqual([{ id: 'o1', name: 'A', role: 'DRIVER', members: 3 }])
  })
})

describe('/api/organizations/[orgId]', () => {
  it('is a 404 to somebody outside it', async () => {
    member.findUnique.mockResolvedValue(null)
    expect((await getOrg(req(), orgParams)).status).toBe(404)
    expect((await patchOrg(req({ name: 'X' }), orgParams)).status).toBe(404)
    expect((await deleteOrg(req(), orgParams)).status).toBe(404)
    expect(org.update).not.toHaveBeenCalled()
    expect(org.delete).not.toHaveBeenCalled()
  })

  it('shows members’ addresses to owners only', async () => {
    member.findMany.mockResolvedValue([
      { id: 'm-me', userId: 'me', role: 'DRIVER', createdAt: new Date(), user: { displayName: 'Me', email: 'me@x.ro' } },
      { id: 'm2', userId: 'u2', role: 'OWNER', createdAt: new Date(), user: { displayName: 'Boss', email: 'boss@x.ro' } },
    ])
    callerIs('DRIVER')
    const asDriver = await (await getOrg(req(), orgParams)).json()
    expect(asDriver.members.map((m: { email: string | null }) => m.email)).toEqual([null, null])
    callerIs('OWNER')
    const asOwner = await (await getOrg(req(), orgParams)).json()
    expect(asOwner.members.map((m: { email: string | null }) => m.email)).toEqual(['me@x.ro', 'boss@x.ro'])
  })

  it.each(['FLEET_MANAGER', 'MECHANIC', 'DRIVER'])('a %s cannot edit or delete it', async (role) => {
    callerIs(role)
    expect((await patchOrg(req({ name: 'X' }), orgParams)).status).toBe(403)
    expect((await deleteOrg(req(), orgParams)).status).toBe(403)
    expect(org.update).not.toHaveBeenCalled()
    expect(org.delete).not.toHaveBeenCalled()
  })

  it('is not deleted while it still has vehicles', async () => {
    callerIs('OWNER')
    vehicle.count.mockResolvedValue(2)
    const res = await deleteOrg(req(), orgParams)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('orgHasVehicles')
    expect(org.delete).not.toHaveBeenCalled()
  })

  it('an owner edits and deletes it', async () => {
    callerIs('OWNER')
    org.update.mockResolvedValue(ORG)
    expect((await patchOrg(req({ billingAddress: 'Str. X 1' }), orgParams)).status).toBe(200)
    expect(org.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { billingAddress: 'Str. X 1' } })
    expect((await deleteOrg(req(), orgParams)).status).toBe(200)
    expect(org.delete).toHaveBeenCalledWith({ where: { id: 'o1' } })
  })
})

describe('/api/organizations/[orgId]/members/[memberId]', () => {
  it('only an owner changes roles or removes someone else', async () => {
    callerIs('FLEET_MANAGER')
    targets.m2 = { id: 'm2', organizationId: 'o1', userId: 'u2', role: 'DRIVER' }
    expect((await patchMember(req({ role: 'MECHANIC' }), memberParams('m2'))).status).toBe(403)
    expect((await deleteMember(req(), memberParams('m2'))).status).toBe(403)
    expect(member.update).not.toHaveBeenCalled()
    expect(member.delete).not.toHaveBeenCalled()
  })

  it('refuses a role that is not one', async () => {
    callerIs('OWNER')
    const res = await patchMember(req({ role: 'ADMIN' }), memberParams('m2'))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('orgRoleInvalid')
  })

  it('changes a role under the organisation’s row lock', async () => {
    callerIs('OWNER')
    targets.m2 = { id: 'm2', organizationId: 'o1', userId: 'u2', role: 'DRIVER' }
    member.count.mockResolvedValue(1)
    member.update.mockResolvedValue({ ...targets.m2, role: 'FLEET_MANAGER' })
    expect((await patchMember(req({ role: 'FLEET_MANAGER' }), memberParams('m2'))).status).toBe(200)
    expect(prisma.$queryRaw).toHaveBeenCalled()
    const sql = ((prisma.$queryRaw as jest.Mock).mock.calls[0][0] as string[]).join('?')
    expect(sql).toContain('FOR UPDATE')
    expect(member.update).toHaveBeenCalledWith({ where: { id: 'm2' }, data: { role: 'FLEET_MANAGER' } })
  })

  it('the last owner cannot demote themselves or leave', async () => {
    callerIs('OWNER')
    targets['m-me'] = { id: 'm-me', organizationId: 'o1', userId: 'me', role: 'OWNER' }
    member.count.mockResolvedValue(1)
    const demote = await patchMember(req({ role: 'DRIVER' }), memberParams('m-me'))
    expect(demote.status).toBe(409)
    expect((await demote.json()).code).toBe('orgLastOwner')
    expect((await deleteMember(req(), memberParams('m-me'))).status).toBe(409)
    expect(member.update).not.toHaveBeenCalled()
    expect(member.delete).not.toHaveBeenCalled()
  })

  it('an owner can step down once there is another', async () => {
    callerIs('OWNER')
    targets['m-me'] = { id: 'm-me', organizationId: 'o1', userId: 'me', role: 'OWNER' }
    member.count.mockResolvedValue(2)
    expect((await deleteMember(req(), memberParams('m-me'))).status).toBe(200)
    expect(member.delete).toHaveBeenCalledWith({ where: { id: 'm-me' } })
  })

  it('anyone can leave', async () => {
    callerIs('DRIVER')
    targets['m-me'] = { id: 'm-me', organizationId: 'o1', userId: 'me', role: 'DRIVER' }
    member.count.mockResolvedValue(1)
    expect((await deleteMember(req(), memberParams('m-me'))).status).toBe(200)
  })

  it('a member id from another organisation is a 404, not a change', async () => {
    callerIs('OWNER')
    targets.m9 = { id: 'm9', organizationId: 'other', userId: 'u9', role: 'DRIVER' }
    expect((await deleteMember(req(), memberParams('m9'))).status).toBe(404)
    expect((await patchMember(req({ role: 'OWNER' }), memberParams('m9'))).status).toBe(404)
    expect(member.delete).not.toHaveBeenCalled()
    expect(member.update).not.toHaveBeenCalled()
  })
})

describe('admin: the closed-beta switch', () => {
  beforeEach(() => {
    mockSession.mockResolvedValue({ user: { id: 'admin', active: true, isAdmin: true } })
    user.findUnique.mockResolvedValue({ id: 'u1', active: true, isAdmin: false, displayName: 'U' })
    user.update.mockResolvedValue({})
  })

  it('switches it on with a timestamp and off with null', async () => {
    await adminPatchUser(req({ orgBeta: true }), { params: { userId: 'u1' } })
    expect(user.update.mock.calls[0][0].data.orgBetaAt).toBeInstanceOf(Date)
    await adminPatchUser(req({ orgBeta: false }), { params: { userId: 'u1' } })
    expect(user.update.mock.calls[1][0].data).toEqual({ orgBetaAt: null })
  })

  it('is not reachable by a non-admin', async () => {
    mockSession.mockResolvedValue({ user: { id: 'me', active: true, isAdmin: false } })
    expect((await adminPatchUser(req({ orgBeta: true }), { params: { userId: 'me' } })).status).toBe(404)
    expect(user.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/me/account and organisations', () => {
  beforeEach(() => {
    ;(collectStorageKeys as jest.Mock).mockResolvedValue([])
    ;(deleteStoredFiles as jest.Mock).mockResolvedValue(undefined)
  })

  it('is refused while the account is the last owner of an organisation others are in', async () => {
    member.findMany.mockResolvedValue([
      { role: 'OWNER', organization: { id: 'o1', name: 'Transport SRL', members: [{ role: 'OWNER' }, { role: 'DRIVER' }] } },
    ])
    const res = await deleteAccount()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('orgLastOwnerAccount')
    expect(body.organizations).toEqual([{ id: 'o1', name: 'Transport SRL' }])
    expect(user.delete).not.toHaveBeenCalled()
  })

  it('takes an organisation nobody else is in with it, and only that one', async () => {
    member.findMany.mockResolvedValue([
      { role: 'OWNER', organization: { id: 'solo', name: 'Solo', members: [{ role: 'OWNER' }] } },
      { role: 'DRIVER', organization: { id: 'o1', name: 'Other', members: [{ role: 'DRIVER' }, { role: 'OWNER' }] } },
    ])
    expect((await deleteAccount()).status).toBe(200)
    expect(org.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['solo'] } } })
    expect(user.delete).toHaveBeenCalledWith({ where: { id: 'me' } })
  })

  /** RL-038 slice 3: company vehicles are the organisation's, not the account's. */
  it('hands company vehicles it is the record for to another owner, clearing the slug', async () => {
    member.findMany.mockResolvedValue([
      { role: 'OWNER', organization: { id: 'o1', name: 'Other', members: [{ role: 'OWNER' }, { role: 'OWNER' }] } },
    ])
    vehicle.findMany.mockResolvedValueOnce([{ id: 'v1', organizationId: 'o1' }])
    member.findFirst.mockResolvedValue({ userId: 'heir' })
    expect((await deleteAccount()).status).toBe(200)
    expect(member.findFirst.mock.calls[0][0].where).toEqual({ organizationId: 'o1', role: 'OWNER', userId: { not: 'me' } })
    expect(vehicle.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { ownerId: 'heir', slug: null } })
    expect(vehicle.deleteMany).toHaveBeenCalledWith({ where: { organizationId: { in: [] } } })
  })

  it('an organisation that goes with the account takes its vehicles and their files', async () => {
    member.findMany.mockResolvedValue([{ role: 'OWNER', organization: { id: 'solo', name: 'Solo', members: [{ role: 'OWNER' }] } }])
    vehicle.findMany
      .mockResolvedValueOnce([{ id: 'v1', organizationId: 'solo' }])
      .mockResolvedValueOnce([{ id: 'v1', ownerId: 'me' }, { id: 'v2', ownerId: 'former-member' }])
    ;(collectStorageKeys as jest.Mock).mockImplementation((uid: string, vid?: string) =>
      Promise.resolve(vid ? [`${uid}/${vid}/x.jpg`] : ['me/avatar.jpg'])
    )
    const res = await deleteAccount()
    expect(res.status).toBe(200)
    expect(vehicle.update).not.toHaveBeenCalled()
    expect(vehicle.deleteMany).toHaveBeenCalledWith({ where: { organizationId: { in: ['solo'] } } })
    expect(collectStorageKeys).toHaveBeenCalledWith('former-member', 'v2')
    expect(deleteStoredFiles).toHaveBeenCalledWith(expect.arrayContaining(['me/avatar.jpg', 'former-member/v2/x.jpg']))
  })
})

describe('schema', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8')

  it('one membership per person per organisation is a database constraint', () => {
    const model = schema.slice(schema.indexOf('model OrganizationMember {'))
    expect(model.slice(0, model.indexOf('\n}'))).toContain('@@unique([organizationId, userId])')
  })

  /**
   * A company vehicle is never public, in the database: its public page
   * would sit under one person's username.
   */
  it('a company vehicle cannot be public, as a CHECK constraint', () => {
    const migration = fs.readFileSync(
      path.join(process.cwd(), 'prisma/migrations/20260928120000_company_vehicles/migration.sql'),
      'utf8'
    )
    expect(migration).toMatch(/CHECK \("organizationId" IS NULL OR "isPublic" = false\)/)
  })
})
