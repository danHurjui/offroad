jest.mock('@/lib/prisma', () => {
  const user = { findUnique: jest.fn(), create: jest.fn() }
  // Registration now claims a founding-member slot in the same transaction
  // as the account, so the mock has to hand the callback a working handle.
  // The same `user.create` mock backs both paths, so assertions about what
  // was created are unaffected by which one ran.
  const $queryRaw = jest.fn().mockResolvedValue([])
  return {
    prisma: {
      user,
      $queryRaw,
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn({ user, $queryRaw })),
    },
  }
})
jest.mock('@/lib/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
  isPasswordStrongEnough: jest.requireActual('@/lib/password').isPasswordStrongEnough,
}))

import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/auth/register/route'

const mockFindUnique = prisma.user.findUnique as jest.Mock
const mockCreate = prisma.user.create as jest.Mock
const mockClaimSlot = (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw

beforeEach(() => {
  // Default: the promotion is exhausted, so these tests exercise an
  // ordinary signup. The founding-member path has its own suite.
  mockClaimSlot.mockResolvedValue([])
})

function makeReq(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}

beforeEach(() => jest.clearAllMocks())

describe('POST /api/auth/register', () => {
  it('returns 400 for an invalid email', async () => {
    const res = await POST(makeReq({ email: 'not-an-email', password: 'longenough1', displayName: 'Dan' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for a short password', async () => {
    const res = await POST(makeReq({ email: 'a@b.com', password: 'short', displayName: 'Dan' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for a missing display name', async () => {
    const res = await POST(makeReq({ email: 'a@b.com', password: 'longenough1', displayName: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 without leaking that the email already exists', async () => {
    mockFindUnique.mockResolvedValue({ id: 'u1' })
    const res = await POST(makeReq({ email: 'a@b.com', password: 'longenough1', displayName: 'Dan' }))
    const data = await res.json()
    expect(res.status).toBe(400)
    expect(data.error).not.toMatch(/exist/i)
  })

  it('creates the user and returns 201', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'u1', email: 'a@b.com', displayName: 'Dan' })
    const res = await POST(makeReq({ email: 'A@B.com', password: 'longenough1', displayName: 'Dan' }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.email).toBe('a@b.com')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: 'a@b.com', accountType: 'OWNER' }) })
    )
  })

  it('generates a username for the public profile URL', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({ id: 'u1', email: 'a@b.com', displayName: 'Dan Hurjui' })
    await POST(makeReq({ email: 'a@b.com', password: 'longenough1', displayName: 'Dan Hurjui' }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ username: 'dan-hurjui' }) })
    )
  })

  it('comps the account when a founding-member slot is free', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockClaimSlot.mockResolvedValue([{ taken: 3 }])
    mockCreate.mockResolvedValue({ id: 'u1', email: 'a@b.com', displayName: 'Dan', foundingNumber: 3 })

    const res = await POST(makeReq({ email: 'a@b.com', password: 'longenough1', displayName: 'Dan' }))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.foundingNumber).toBe(3)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ foundingNumber: 3, isProComped: true }),
      })
    )
    // isPro belongs to the Stripe webhook and would be revoked by a
    // cancellation the founding member never made.
    expect(mockCreate.mock.calls[0][0].data).not.toHaveProperty('isPro')
  })

  it('creates an ordinary account once the promotion is exhausted', async () => {
    mockFindUnique.mockResolvedValue(null)
    mockClaimSlot.mockResolvedValue([])
    mockCreate.mockResolvedValue({ id: 'u1', email: 'a@b.com', displayName: 'Dan', foundingNumber: null })

    const res = await POST(makeReq({ email: 'a@b.com', password: 'longenough1', displayName: 'Dan' }))
    expect(res.status).toBe(201)
    expect((await res.json()).foundingNumber).toBeNull()
    expect(mockCreate.mock.calls[0][0].data).not.toHaveProperty('isProComped')
  })
})
