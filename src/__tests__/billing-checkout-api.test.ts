jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/stripe', () => ({
  ...jest.requireActual('@/lib/stripe'),
  getStripe: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { POST } from '@/app/api/billing/checkout/route'

const mockGetSession = getServerSession as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock
const mockGetStripe = getStripe as jest.Mock

const mockCustomersCreate = jest.fn()
const mockCheckoutCreate = jest.fn()

function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_PRICE_MONTHLY = 'price_monthly'
  process.env.STRIPE_PRICE_ANNUAL = 'price_annual'
  process.env.STRIPE_PRICE_LIFETIME = 'price_lifetime'
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
  mockUserFindUnique.mockResolvedValue({ id: 'u1', email: 'u1@x.com', isPro: false, stripeCustomerId: null })
  mockGetStripe.mockReturnValue({
    customers: { create: mockCustomersCreate },
    checkout: { sessions: { create: mockCheckoutCreate } },
  })
  mockCustomersCreate.mockResolvedValue({ id: 'cus_new' })
  mockCheckoutCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/session123' })
})

describe('POST /api/billing/checkout', () => {
  it('returns 400 for an invalid plan', async () => {
    const res = await POST(req({ plan: 'WEEKLY' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when the user is already Pro', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'u1', email: 'u1@x.com', isPro: true, stripeCustomerId: 'cus_1' })
    const res = await POST(req({ plan: 'MONTHLY' }))
    expect(res.status).toBe(400)
    expect(mockCheckoutCreate).not.toHaveBeenCalled()
  })

  it('creates a Stripe customer and saves it when the user has none yet', async () => {
    const res = await POST(req({ plan: 'MONTHLY' }))
    expect(res.status).toBe(200)
    expect(mockCustomersCreate).toHaveBeenCalledWith({ email: 'u1@x.com', metadata: { userId: 'u1' } })
    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { stripeCustomerId: 'cus_new' } })
  })

  it('reuses an existing Stripe customer without creating a new one', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'u1', email: 'u1@x.com', isPro: false, stripeCustomerId: 'cus_existing' })
    await POST(req({ plan: 'ANNUAL' }))
    expect(mockCustomersCreate).not.toHaveBeenCalled()
    expect(mockCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_existing' }))
  })

  it('uses subscription mode for MONTHLY/ANNUAL and payment mode for LIFETIME', async () => {
    await POST(req({ plan: 'LIFETIME' }))
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'payment', line_items: [{ price: 'price_lifetime', quantity: 1 }] })
    )
  })

  it('returns the checkout URL', async () => {
    const res = await POST(req({ plan: 'MONTHLY' }))
    const body = await res.json()
    expect(body.url).toBe('https://checkout.stripe.com/session123')
  })
})
