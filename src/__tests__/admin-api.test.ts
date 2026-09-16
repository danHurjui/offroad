jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), update: jest.fn() },
    ticket: { findMany: jest.fn(), count: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { requireSession, requireAdmin } from '@/lib/authz'
import { GET as listUsers } from '@/app/api/admin/users/route'
import { GET as getUser, PATCH as patchUser } from '@/app/api/admin/users/[userId]/route'
import { GET as listTickets } from '@/app/api/admin/tickets/route'

const mockSession = getServerSession as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserFindMany = prisma.user.findMany as jest.Mock
const mockUserCount = prisma.user.count as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock

const ADMIN = { user: { id: 'admin-1', active: true, isAdmin: true } }
const PLAIN = { user: { id: 'user-1', active: true, isAdmin: false } }
const BANNED = { user: { id: 'user-2', active: false, isAdmin: false } }

function req(body?: unknown, url = 'http://localhost/api/admin/users') {
  return {
    url,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
  } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUserFindMany.mockResolvedValue([])
  mockUserCount.mockResolvedValue(0)
  ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.ticket.count as jest.Mock).mockResolvedValue(0)
})

describe('requireSession rejects a deactivated account', () => {
  // The session token stays cryptographically valid after a ban, so the
  // flag has to be enforced on every request, not just at sign-in.
  it('403s a session whose account was deactivated', async () => {
    mockSession.mockResolvedValue(BANNED)
    const r = await requireSession()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.status).toBe(403)
  })

  it('still allows an active account', async () => {
    mockSession.mockResolvedValue(PLAIN)
    expect((await requireSession()).ok).toBe(true)
  })

  // Tokens minted before the flag existed have no `active`; they must not
  // be locked out on the strength of a missing field.
  it('treats a token without the flag as active', async () => {
    mockSession.mockResolvedValue({ user: { id: 'legacy' } })
    expect((await requireSession()).ok).toBe(true)
  })
})

describe('requireAdmin', () => {
  it('404s — not 403s — for a non-admin, so the area stays unadvertised', async () => {
    mockSession.mockResolvedValue(PLAIN)
    const r = await requireAdmin()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.status).toBe(404)
  })

  it('401s when there is no session at all', async () => {
    mockSession.mockResolvedValue(null)
    const r = await requireAdmin()
    if (!r.ok) expect(r.error.status).toBe(401)
  })

  it('403s a deactivated admin before the admin check', async () => {
    mockSession.mockResolvedValue({ user: { id: 'a', active: false, isAdmin: true } })
    const r = await requireAdmin()
    if (!r.ok) expect(r.error.status).toBe(403)
  })

  it('allows an active admin', async () => {
    mockSession.mockResolvedValue(ADMIN)
    expect((await requireAdmin()).ok).toBe(true)
  })
})

describe('every admin endpoint is gated', () => {
  const endpoints: [string, () => Promise<Response>][] = [
    ['GET /api/admin/users', () => listUsers(req())],
    ['GET /api/admin/users/[userId]', () => getUser(req(), { params: { userId: 'u1' } })],
    ['PATCH /api/admin/users/[userId]', () => patchUser(req({ active: false }), { params: { userId: 'u1' } })],
    ['GET /api/admin/tickets', () => listTickets(req(undefined, 'http://localhost/api/admin/tickets'))],
  ]

  it.each(endpoints)('%s 404s for a plain user', async (_label, call) => {
    mockSession.mockResolvedValue(PLAIN)
    expect((await call()).status).toBe(404)
  })

  it.each(endpoints)('%s 401s for an anonymous caller', async (_label, call) => {
    mockSession.mockResolvedValue(null)
    expect((await call()).status).toBe(401)
  })

  it.each(endpoints)('%s 403s for a deactivated user', async (_label, call) => {
    mockSession.mockResolvedValue(BANNED)
    expect((await call()).status).toBe(403)
  })

  it('does not query the database when the caller is not an admin', async () => {
    mockSession.mockResolvedValue(PLAIN)
    await listUsers(req())
    expect(mockUserFindMany).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/users/[userId]', () => {
  beforeEach(() => {
    mockSession.mockResolvedValue(ADMIN)
    mockUserFindUnique.mockResolvedValue({ id: 'u1', active: true, isAdmin: false, displayName: 'Target' })
    mockUserUpdate.mockImplementation(({ data }: { data: { active: boolean } }) =>
      Promise.resolve({ id: 'u1', displayName: 'Target', email: 't@x.com', active: data.active })
    )
  })

  it('deactivates a user', async () => {
    const res = await patchUser(req({ active: false }), { params: { userId: 'u1' } })
    expect(res.status).toBe(200)
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { active: false } }))
  })

  it('reactivates a user', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'u1', active: false, isAdmin: false, displayName: 'Target' })
    await patchUser(req({ active: true }), { params: { userId: 'u1' } })
    expect(mockUserUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { active: true } }))
  })

  // Locking yourself out is the one mistake with no in-app way back.
  it('refuses self-deactivation', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'admin-1', active: true, isAdmin: true, displayName: 'Me' })
    const res = await patchUser(req({ active: false }), { params: { userId: 'admin-1' } })
    expect(res.status).toBe(400)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('refuses to deactivate another admin', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'admin-2', active: true, isAdmin: true, displayName: 'Peer' })
    const res = await patchUser(req({ active: false }), { params: { userId: 'admin-2' } })
    expect(res.status).toBe(400)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('still allows reactivating an admin', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'admin-2', active: false, isAdmin: true, displayName: 'Peer' })
    expect((await patchUser(req({ active: true }), { params: { userId: 'admin-2' } })).status).toBe(200)
  })

  // The documented invariants: Stripe owns isPro, the database owns isAdmin.
  it.each([
    ['isPro', { isPro: true }],
    ['isAdmin', { isAdmin: true }],
    ['email', { email: 'attacker@evil.com' }],
    ['password', { password: 'hunter2' }],
  ])('rejects a body that only tries to set %s', async (_label, body) => {
    const res = await patchUser(req(body), { params: { userId: 'u1' } })
    expect(res.status).toBe(400)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('ignores privileged fields smuggled alongside a legitimate change', async () => {
    await patchUser(req({ active: false, isPro: true, isAdmin: true, email: 'x@y.z' }), {
      params: { userId: 'u1' },
    })
    // Only `active` reaches Prisma — the rest are never merged in.
    const data = mockUserUpdate.mock.calls[0][0].data
    expect(Object.keys(data)).toEqual(['active'])
  })

  describe('complimentary Pro', () => {
    it('grants a comp and records who and why', async () => {
      const res = await patchUser(req({ isProComped: true, proCompedReason: 'Beta tester' }), {
        params: { userId: 'u1' },
      })
      expect(res.status).toBe(200)
      const data = mockUserUpdate.mock.calls[0][0].data
      expect(data.isProComped).toBe(true)
      expect(data.proCompedReason).toBe('Beta tester')
      expect(data.proCompedById).toBe('admin-1')
      expect(data.proCompedAt).toBeInstanceOf(Date)
    })

    // The comp exists precisely so Stripe's column is never written here.
    it('never writes isPro when granting a comp', async () => {
      await patchUser(req({ isProComped: true, proCompedReason: 'x' }), { params: { userId: 'u1' } })
      expect(mockUserUpdate.mock.calls[0][0].data.isPro).toBeUndefined()
    })

    it('clears the justification when revoking, so it cannot read as live', async () => {
      await patchUser(req({ isProComped: false }), { params: { userId: 'u1' } })
      const data = mockUserUpdate.mock.calls[0][0].data
      expect(data.isProComped).toBe(false)
      expect(data.proCompedAt).toBeNull()
      expect(data.proCompedById).toBeNull()
      expect(data.proCompedReason).toBeNull()
    })

    it('stores no reason rather than an empty string', async () => {
      await patchUser(req({ isProComped: true, proCompedReason: '   ' }), { params: { userId: 'u1' } })
      expect(mockUserUpdate.mock.calls[0][0].data.proCompedReason).toBeNull()
    })

    it('truncates an over-long reason', async () => {
      await patchUser(req({ isProComped: true, proCompedReason: 'x'.repeat(900) }), {
        params: { userId: 'u1' },
      })
      expect(mockUserUpdate.mock.calls[0][0].data.proCompedReason).toHaveLength(500)
    })

    it('can change activation and the comp in one call', async () => {
      await patchUser(req({ active: false, isProComped: true, proCompedReason: 'r' }), {
        params: { userId: 'u1' },
      })
      const data = mockUserUpdate.mock.calls[0][0].data
      expect(data.active).toBe(false)
      expect(data.isProComped).toBe(true)
    })

    it('still refuses isPro smuggled in beside a comp', async () => {
      await patchUser(req({ isProComped: true, proCompedReason: 'r', isPro: true, isAdmin: true }), {
        params: { userId: 'u1' },
      })
      const data = mockUserUpdate.mock.calls[0][0].data
      expect(data.isPro).toBeUndefined()
      expect(data.isAdmin).toBeUndefined()
    })
  })

  it('404s for a user that does not exist', async () => {
    mockUserFindUnique.mockResolvedValue(null)
    expect((await patchUser(req({ active: false }), { params: { userId: 'nope' } })).status).toBe(404)
  })

  it('400s on a malformed body rather than 500ing', async () => {
    expect((await patchUser(req(), { params: { userId: 'u1' } })).status).toBe(400)
  })
})

describe('GET /api/admin/users', () => {
  it('never returns password hashes', async () => {
    mockSession.mockResolvedValue(ADMIN)
    await listUsers(req(undefined, 'http://localhost/api/admin/users?q=dan'))
    const select = mockUserFindMany.mock.calls[0][0].select
    expect(select.password).toBeUndefined()
    expect(select.email).toBe(true)
  })

  it('applies the search across email, name and username', async () => {
    mockSession.mockResolvedValue(ADMIN)
    await listUsers(req(undefined, 'http://localhost/api/admin/users?q=dan'))
    const or = mockUserFindMany.mock.calls[0][0].where.OR
    expect(or).toHaveLength(3)
  })

  it('filters by activation status', async () => {
    mockSession.mockResolvedValue(ADMIN)
    await listUsers(req(undefined, 'http://localhost/api/admin/users?status=inactive'))
    expect(mockUserFindMany.mock.calls[0][0].where.active).toBe(false)
  })
})
