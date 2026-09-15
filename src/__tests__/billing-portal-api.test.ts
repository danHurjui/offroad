jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: jest.fn() } },
}))
jest.mock('@/lib/stripe', () => ({
  ...jest.requireActual('@/lib/stripe'),
  getStripe: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { POST } from '@/app/api/billing/portal/route'

const mockGetSession = getServerSession as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockGetStripe = getStripe as jest.Mock
const mockPortalCreate = jest.fn()

function req() {
  return {} as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
  mockGetStripe.mockReturnValue({ billingPortal: { sessions: { create: mockPortalCreate } } })
  mockPortalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/session123' })
})

describe('POST /api/billing/portal', () => {
  it('returns 400 when the user has no Stripe customer yet', async () => {
    mockUserFindUnique.mockResolvedValue({ stripeCustomerId: null })
    const res = await POST(req())
    expect(res.status).toBe(400)
    expect(mockPortalCreate).not.toHaveBeenCalled()
  })

  it('returns the portal URL for an existing customer', async () => {
    mockUserFindUnique.mockResolvedValue({ stripeCustomerId: 'cus_1' })
    const res = await POST(req())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toBe('https://billing.stripe.com/session123')
    expect(mockPortalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_1' }))
  })
})
