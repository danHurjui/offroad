jest.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: jest.fn(), create: jest.fn() } },
}))
jest.mock('@/lib/password', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
  isPasswordStrongEnough: jest.requireActual('@/lib/password').isPasswordStrongEnough,
}))

import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/auth/register/route'

const mockFindUnique = prisma.user.findUnique as jest.Mock
const mockCreate = prisma.user.create as jest.Mock

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
})
