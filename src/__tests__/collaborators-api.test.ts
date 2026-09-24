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
    user: { findUnique: jest.fn() },
    projectCollaborator: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  collaboratorInviteEmail: jest.fn().mockResolvedValue({ subject: 's', html: '<p>x</p>' }),
  inviteeLocale: jest.fn().mockReturnValue('ro'),
  // Inviting now goes through requireVerifiedSession, which asks whether
  // the confirmation rule can be enforced at all — and that question is
  // "is a mail provider configured". Saying yes here keeps these cases
  // about collaborators: the owner they stub is verified, so the gate
  // passes and the assertions below are still about what they say they
  // are. emailVerification.test.ts is where the gate itself is tested.
  isEmailConfigured: jest.fn().mockReturnValue(true),
  emailLocale: jest.fn().mockReturnValue('ro'),
}))
// The email/notification path builds its translator directly from the
// catalogue (src/i18n/translator.ts), so there is no request context to
// stub — only a locale to pass.
jest.mock('@/i18n/translator', () => ({
  translator: jest.fn().mockResolvedValue((key: string) => `t:${key}`),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { GET, POST } from '@/app/api/vehicles/[id]/collaborators/route'
import { DELETE } from '@/app/api/vehicles/[id]/collaborators/[collabId]/route'
import { POST as RESEND } from '@/app/api/vehicles/[id]/collaborators/[collabId]/resend/route'
import { POST as ACCEPT } from '@/app/api/collaborate/accept/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockCollabFindMany = prisma.projectCollaborator.findMany as jest.Mock
const mockCollabFindFirst = prisma.projectCollaborator.findFirst as jest.Mock
const mockCollabFindUnique = prisma.projectCollaborator.findUnique as jest.Mock
const mockCollabCount = prisma.projectCollaborator.count as jest.Mock
const mockCollabCreate = prisma.projectCollaborator.create as jest.Mock
const mockCollabUpdate = prisma.projectCollaborator.update as jest.Mock

const VEHICLE = { id: 'v1', ownerId: 'owner', make: 'Jeep', model: 'Wrangler', year: 2001 }
const params = { id: 'v1' }

function jsonReq(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}
function emptyReq() {
  return {} as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
  mockUserFindUnique.mockResolvedValue({ isPro: false, displayName: 'Owner', emailVerifiedAt: new Date() })
})

describe('GET /api/vehicles/[id]/collaborators', () => {
  it('returns 404 for a non-owner', async () => {
    mockVehicleFindUnique.mockResolvedValue(null)
    const res = await GET(emptyReq(), { params })
    expect(res.status).toBe(404)
  })

  it('strips inviteToken from the response', async () => {
    mockCollabFindMany.mockResolvedValue([
      { id: 'c1', email: 'm@x.com', inviteToken: 'secret', collaboratorUser: null },
    ])
    const res = await GET(emptyReq(), { params })
    const body = await res.json()
    expect(body[0].inviteToken).toBeUndefined()
    expect(body[0].email).toBe('m@x.com')
  })
})

describe('POST /api/vehicles/[id]/collaborators', () => {
  it('returns 400 for an invalid email', async () => {
    mockCollabCount.mockResolvedValue(0)
    const res = await POST(jsonReq({ email: 'not-an-email' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 when the email is already an active collaborator', async () => {
    mockCollabFindFirst.mockResolvedValue({ id: 'existing' })
    const res = await POST(jsonReq({ email: 'mechanic@x.com' }), { params })
    expect(res.status).toBe(400)
    expect(mockCollabCreate).not.toHaveBeenCalled()
  })

  it('returns 403 with UPGRADE_REQUIRED when the free tier limit is hit', async () => {
    mockCollabFindFirst.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ isPro: false, displayName: 'Owner', emailVerifiedAt: new Date() })
    mockCollabCount.mockResolvedValueOnce(3)
    const res = await POST(jsonReq({ email: 'mechanic@x.com' }), { params })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('UPGRADE_REQUIRED')
  })

  it('does not enforce the free tier limit for Pro owners', async () => {
    mockCollabFindFirst.mockResolvedValue(null)
    mockUserFindUnique.mockResolvedValue({ isPro: true, displayName: 'Owner', emailVerifiedAt: new Date() })
    mockCollabCount.mockResolvedValue(0)
    mockCollabCreate.mockResolvedValue({ id: 'c1', email: 'mechanic@x.com', inviteToken: 'tok' })
    const res = await POST(jsonReq({ email: 'mechanic@x.com' }), { params })
    expect(res.status).toBe(201)
  })

  it('returns 429 when the daily invite limit is reached', async () => {
    mockCollabFindFirst.mockResolvedValue(null)
    mockCollabCount.mockResolvedValueOnce(0).mockResolvedValueOnce(10)
    const res = await POST(jsonReq({ email: 'mechanic@x.com' }), { params })
    expect(res.status).toBe(429)
    expect(mockCollabCreate).not.toHaveBeenCalled()
  })

  it('creates the invite and sends an email on success', async () => {
    mockCollabFindFirst.mockResolvedValue(null)
    mockCollabCount.mockResolvedValue(0)
    mockCollabCreate.mockResolvedValue({ id: 'c1', email: 'mechanic@x.com', inviteToken: 'tok' })
    const res = await POST(jsonReq({ email: 'mechanic@x.com', role: 'SPECIALIST' }), { params })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.inviteToken).toBeUndefined()
    expect(sendEmail).toHaveBeenCalled()
  })
})

describe('DELETE /api/vehicles/[id]/collaborators/[collabId]', () => {
  const p = { id: 'v1', collabId: 'c1' }

  it('returns 404 when the collaborator does not belong to this vehicle', async () => {
    mockCollabFindUnique.mockResolvedValue({ id: 'c1', vehicleId: 'other-vehicle' })
    const res = await DELETE(emptyReq(), { params: p })
    expect(res.status).toBe(404)
  })

  it('returns 400 when already removed', async () => {
    mockCollabFindUnique.mockResolvedValue({ id: 'c1', vehicleId: 'v1', status: 'REMOVED' })
    const res = await DELETE(emptyReq(), { params: p })
    expect(res.status).toBe(400)
  })

  it('sets status to REMOVED on success', async () => {
    mockCollabFindUnique.mockResolvedValue({ id: 'c1', vehicleId: 'v1', status: 'ACTIVE' })
    mockCollabUpdate.mockResolvedValue({ id: 'c1', status: 'REMOVED' })
    const res = await DELETE(emptyReq(), { params: p })
    expect(res.status).toBe(200)
    expect(mockCollabUpdate).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { status: 'REMOVED' } })
  })
})

describe('POST /api/vehicles/[id]/collaborators/[collabId]/resend', () => {
  const p = { id: 'v1', collabId: 'c1' }

  it('returns 400 when the invite is not pending', async () => {
    mockCollabFindUnique.mockResolvedValue({ id: 'c1', vehicleId: 'v1', status: 'ACTIVE' })
    const res = await RESEND(emptyReq(), { params: p })
    expect(res.status).toBe(400)
  })

  it('regenerates the token and resends the email', async () => {
    mockCollabFindUnique.mockResolvedValue({ id: 'c1', vehicleId: 'v1', status: 'PENDING', email: 'm@x.com', inviteToken: 'old' })
    mockCollabUpdate.mockResolvedValue({ id: 'c1', email: 'm@x.com', inviteToken: 'new' })
    const res = await RESEND(emptyReq(), { params: p })
    expect(res.status).toBe(200)
    expect(sendEmail).toHaveBeenCalled()
  })
})

describe('POST /api/collaborate/accept', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: { id: 'collaborator' } })
  })

  it('returns 400 when the token is missing', async () => {
    const res = await ACCEPT(jsonReq({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 when the invite does not exist', async () => {
    mockCollabFindUnique.mockResolvedValue(null)
    const res = await ACCEPT(jsonReq({ token: 'tok' }))
    expect(res.status).toBe(404)
  })

  it('returns 410 when the invite was revoked', async () => {
    mockCollabFindUnique.mockResolvedValue({ id: 'c1', status: 'REMOVED', email: 'm@x.com', invitedAt: new Date() })
    const res = await ACCEPT(jsonReq({ token: 'tok' }))
    expect(res.status).toBe(410)
  })

  it('returns 400 when already accepted', async () => {
    mockCollabFindUnique.mockResolvedValue({ id: 'c1', status: 'ACTIVE', email: 'm@x.com', invitedAt: new Date() })
    const res = await ACCEPT(jsonReq({ token: 'tok' }))
    expect(res.status).toBe(400)
  })

  it('returns 410 when the invite has expired', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    mockCollabFindUnique.mockResolvedValue({ id: 'c1', status: 'PENDING', email: 'm@x.com', invitedAt: eightDaysAgo })
    const res = await ACCEPT(jsonReq({ token: 'tok' }))
    expect(res.status).toBe(410)
  })

  it('returns 403 when the logged-in email does not match the invite', async () => {
    mockCollabFindUnique.mockResolvedValue({ id: 'c1', status: 'PENDING', email: 'invited@x.com', invitedAt: new Date() })
    mockUserFindUnique.mockResolvedValue({ email: 'someoneelse@x.com' })
    const res = await ACCEPT(jsonReq({ token: 'tok' }))
    expect(res.status).toBe(403)
  })

  it('activates the collaborator on success', async () => {
    mockCollabFindUnique.mockResolvedValue({ id: 'c1', vehicleId: 'v1', status: 'PENDING', email: 'm@x.com', invitedAt: new Date() })
    mockUserFindUnique.mockResolvedValue({ email: 'm@x.com' })
    mockCollabUpdate.mockResolvedValue({ id: 'c1', status: 'ACTIVE', vehicleId: 'v1' })
    const res = await ACCEPT(jsonReq({ token: 'tok' }))
    expect(res.status).toBe(200)
    expect(mockCollabUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'ACTIVE', collaboratorUserId: 'collaborator', acceptedAt: expect.any(Date) },
    })
    const body = await res.json()
    expect(body.vehicleId).toBe('v1')
  })
})
