jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    organizationInvite: { findUnique: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/rateLimit', () => {
  const actual = jest.requireActual('@/lib/rateLimit')
  return { ...actual, consumeRateLimit: jest.fn() }
})
jest.mock('@/lib/emailVerification', () => {
  const actual = jest.requireActual('@/lib/emailVerification')
  return { ...actual, isBlockedAsUnverified: jest.fn(() => false) }
})
jest.mock('@/lib/email', () => {
  const actual = jest.requireActual('@/lib/email')
  return { ...actual, sendEmail: jest.fn() }
})
jest.mock('@/lib/appUrl', () => ({ appUrlForNotification: jest.fn(() => 'https://riglog.example') }))

import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rateLimit'
import { isBlockedAsUnverified } from '@/lib/emailVerification'
import { sendEmail } from '@/lib/email'
import { hashInviteToken, inviteStatus, newInviteToken, pendingInviteWhere } from '@/lib/organizationInvites'
import { POST as invite } from '@/app/api/organizations/[orgId]/invites/route'
import { DELETE as withdraw } from '@/app/api/organizations/[orgId]/invites/[inviteId]/route'
import { POST as resend } from '@/app/api/organizations/[orgId]/invites/[inviteId]/resend/route'
import { POST as accept } from '@/app/api/organizations/accept/route'

const mockSession = getServerSession as jest.Mock
const user = prisma.user as unknown as Record<string, jest.Mock>
const member = prisma.organizationMember as unknown as Record<string, jest.Mock>
const inv = prisma.organizationInvite as unknown as Record<string, jest.Mock>
const mockSend = sendEmail as jest.Mock

const req = (body?: unknown) =>
  ({ json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)) }) as never
const orgParams = { params: { orgId: 'o1' } }
const inviteParams = { params: { orgId: 'o1', inviteId: 'i1' } }
const ORG = { id: 'o1', name: 'Transport SRL' }

function callerIs(role: string | null) {
  member.findUnique.mockResolvedValue(role ? { id: 'm-me', organizationId: 'o1', userId: 'me', role, organization: ORG } : null)
}
const open = (over: Record<string, unknown> = {}) => ({
  id: 'i1', organizationId: 'o1', email: 'driver@firma.ro', role: 'DRIVER', tokenHash: 'h',
  invitedAt: new Date(), acceptedAt: null, revokedAt: null, invitedByUserId: 'me', ...over,
})

beforeEach(() => {
  jest.clearAllMocks()
  mockSession.mockResolvedValue({ user: { id: 'me', active: true } })
  ;(consumeRateLimit as jest.Mock).mockResolvedValue({ ok: true })
  ;(isBlockedAsUnverified as jest.Mock).mockReturnValue(false)
  user.findUnique.mockResolvedValue({ email: 'me@firma.ro', displayName: 'Dan', locale: 'ro' })
  member.findFirst.mockResolvedValue(null)
  inv.findFirst.mockResolvedValue(null)
  inv.count.mockResolvedValue(0)
  ;(prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
})

describe('tokens and status', () => {
  it('stores only a hash, never the token', () => {
    const { token, tokenHash } = newInviteToken()
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(tokenHash).toBe(hashInviteToken(token))
    expect(tokenHash).not.toContain(token)
  })

  it('is pending for seven days, then expired; accepted and withdrawn win over time', () => {
    const now = new Date('2026-09-23T12:00:00Z')
    const at = (days: number) => new Date(now.getTime() - days * 86400000)
    expect(inviteStatus({ invitedAt: at(6), acceptedAt: null, revokedAt: null }, now)).toBe('pending')
    expect(inviteStatus({ invitedAt: at(7), acceptedAt: null, revokedAt: null }, now)).toBe('expired')
    expect(inviteStatus({ invitedAt: at(9), acceptedAt: now, revokedAt: null }, now)).toBe('accepted')
    expect(inviteStatus({ invitedAt: at(1), acceptedAt: null, revokedAt: now }, now)).toBe('revoked')
    expect(pendingInviteWhere(now).invitedAt.gt).toEqual(at(7))
  })
})

describe('POST /api/organizations/[orgId]/invites', () => {
  it('needs a confirmed address', async () => {
    ;(isBlockedAsUnverified as jest.Mock).mockReturnValue(true)
    const res = await invite(req({ email: 'a@b.ro', role: 'DRIVER' }), orgParams)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('emailNotVerified')
    expect(inv.create).not.toHaveBeenCalled()
  })

  it('is a 404 outside the organisation and a 403 for a non-owner', async () => {
    callerIs(null)
    expect((await invite(req({ email: 'a@b.ro', role: 'DRIVER' }), orgParams)).status).toBe(404)
    callerIs('FLEET_MANAGER')
    expect((await invite(req({ email: 'a@b.ro', role: 'DRIVER' }), orgParams)).status).toBe(403)
    expect(inv.create).not.toHaveBeenCalled()
  })

  it('refuses a bad address or role before spending the rate limit', async () => {
    callerIs('OWNER')
    expect((await invite(req({ email: 'nope', role: 'DRIVER' }), orgParams)).status).toBe(400)
    expect((await invite(req({ email: 'a@b.ro', role: 'BOSS' }), orgParams)).status).toBe(400)
    expect(consumeRateLimit).not.toHaveBeenCalled()
  })

  it('sends it: stores the hash, mails the raw token, keys the limit on the user', async () => {
    callerIs('OWNER')
    inv.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'i1', ...data }))
    const res = await invite(req({ email: ' Driver@Firma.ro ', role: 'DRIVER' }), orgParams)
    expect(res.status).toBe(201)
    expect(consumeRateLimit).toHaveBeenCalledWith('orgInvite', 'user:me')
    const data = inv.create.mock.calls[0][0].data
    expect(data).toMatchObject({ organizationId: 'o1', email: 'driver@firma.ro', role: 'DRIVER', invitedByUserId: 'me' })
    expect(await res.json()).not.toHaveProperty('tokenHash')
    const html: string = mockSend.mock.calls[0][0].html
    const token = /token=([0-9a-f]{64})/.exec(html)![1]
    expect(hashInviteToken(token)).toBe(data.tokenHash)
    expect(html).toContain('https://riglog.example/organizations/accept?token=')
    expect(mockSend.mock.calls[0][0].to).toBe('driver@firma.ro')
  })

  it('refuses someone already in it, or already invited', async () => {
    callerIs('OWNER')
    member.findFirst.mockResolvedValueOnce({ id: 'm2' })
    expect((await (await invite(req({ email: 'a@b.ro', role: 'DRIVER' }), orgParams)).json()).code).toBe('orgAlreadyMember')
    inv.findFirst.mockResolvedValueOnce({ id: 'i0' })
    expect((await (await invite(req({ email: 'a@b.ro', role: 'DRIVER' }), orgParams)).json()).code).toBe('orgAlreadyInvited')
    expect(inv.create).not.toHaveBeenCalled()
  })

  it('caps pending invitations per organisation', async () => {
    callerIs('OWNER')
    inv.count.mockResolvedValue(50)
    expect((await (await invite(req({ email: 'a@b.ro', role: 'DRIVER' }), orgParams)).json()).code).toBe('orgInviteLimit')
  })

  it('stops at the rate limit without sending anything', async () => {
    callerIs('OWNER')
    ;(consumeRateLimit as jest.Mock).mockResolvedValue({ ok: false, retryAfterSeconds: 60 })
    expect((await invite(req({ email: 'a@b.ro', role: 'DRIVER' }), orgParams)).status).toBe(429)
    expect(mockSend).not.toHaveBeenCalled()
  })
})

describe('resend and withdraw', () => {
  it('resend issues a new token and restarts the seven days', async () => {
    callerIs('OWNER')
    inv.findUnique.mockResolvedValue(open({ invitedAt: new Date('2020-01-01') }))
    inv.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ ...open(), ...data }))
    expect((await resend(req(), inviteParams)).status).toBe(200)
    const data = inv.update.mock.calls[0][0].data
    expect(data.tokenHash).not.toBe('h')
    expect(data.invitedAt.getTime()).toBeGreaterThan(Date.now() - 5000)
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  it('will not resend an accepted or withdrawn one', async () => {
    callerIs('OWNER')
    inv.findUnique.mockResolvedValue(open({ acceptedAt: new Date() }))
    expect((await resend(req(), inviteParams)).status).toBe(400)
    inv.findUnique.mockResolvedValue(open({ revokedAt: new Date() }))
    expect((await resend(req(), inviteParams)).status).toBe(400)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('an invitation from another organisation is a 404', async () => {
    callerIs('OWNER')
    inv.findUnique.mockResolvedValue(open({ organizationId: 'other' }))
    expect((await withdraw(req(), inviteParams)).status).toBe(404)
    expect((await resend(req(), inviteParams)).status).toBe(404)
    expect(inv.update).not.toHaveBeenCalled()
  })

  it('only an owner withdraws, and withdrawing stamps revokedAt', async () => {
    inv.findUnique.mockResolvedValue(open())
    callerIs('DRIVER')
    expect((await withdraw(req(), inviteParams)).status).toBe(403)
    callerIs('OWNER')
    expect((await withdraw(req(), inviteParams)).status).toBe(200)
    expect(inv.update.mock.calls[0][0].data.revokedAt).toBeInstanceOf(Date)
  })
})

describe('POST /api/organizations/accept', () => {
  beforeEach(() => {
    user.findUnique.mockResolvedValue({ email: 'Driver@Firma.ro' })
    inv.updateMany.mockResolvedValue({ count: 1 })
  })

  it('looks the invitation up by the hash of the token', async () => {
    inv.findUnique.mockResolvedValue(null)
    expect((await accept(req({ token: 'abc' }))).status).toBe(404)
    expect(inv.findUnique).toHaveBeenCalledWith({ where: { tokenHash: hashInviteToken('abc') } })
  })

  it('joins with the invited role when the address matches', async () => {
    inv.findUnique.mockResolvedValue(open({ role: 'MECHANIC' }))
    const res = await accept(req({ token: 'abc' }))
    expect(res.status).toBe(200)
    expect(inv.updateMany).toHaveBeenCalledWith({
      where: { id: 'i1', acceptedAt: null, revokedAt: null },
      data: { acceptedAt: expect.any(Date) },
    })
    expect(member.create).toHaveBeenCalledWith({ data: { organizationId: 'o1', userId: 'me', role: 'MECHANIC' } })
  })

  it('refuses another account holding the link', async () => {
    user.findUnique.mockResolvedValue({ email: 'someone.else@firma.ro' })
    inv.findUnique.mockResolvedValue(open())
    expect((await (await accept(req({ token: 'abc' }))).json()).code).toBe('inviteWrongEmail')
    expect(member.create).not.toHaveBeenCalled()
  })

  it.each([
    [{ revokedAt: new Date() }, 'inviteRevoked'],
    [{ acceptedAt: new Date() }, 'inviteAlreadyAccepted'],
    [{ invitedAt: new Date('2020-01-01') }, 'inviteExpired'],
  ])('refuses %o', async (over, code) => {
    inv.findUnique.mockResolvedValue(open(over))
    expect((await (await accept(req({ token: 'abc' }))).json()).code).toBe(code)
    expect(member.create).not.toHaveBeenCalled()
  })

  it('a second click, or a withdrawal at the same moment, creates nobody', async () => {
    inv.findUnique.mockResolvedValue(open())
    inv.updateMany.mockResolvedValue({ count: 0 })
    expect((await accept(req({ token: 'abc' }))).status).toBe(400)
    expect(member.create).not.toHaveBeenCalled()
  })

  it('someone already in the organisation gets a clear answer, not a 500', async () => {
    inv.findUnique.mockResolvedValue(open())
    member.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }))
    expect((await (await accept(req({ token: 'abc' }))).json()).code).toBe('orgAlreadyMember')
  })
})

describe('the invitation email', () => {
  it('escapes the names it carries and says the role in the reader’s language', async () => {
    const { organizationInviteEmail } = jest.requireActual('@/lib/email')
    const { subject, html } = await organizationInviteEmail('ro', {
      inviterName: '<i>Dan</i>',
      organizationName: 'Firma <script>',
      role: 'FLEET_MANAGER',
      acceptUrl: 'https://riglog.example/organizations/accept?token=abc',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('Firma &lt;script&gt;')
    expect(html).toContain('Manager de flotă')
    expect(subject).toContain('Firma')
  })
})
