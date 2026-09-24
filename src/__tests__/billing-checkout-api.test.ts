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
  process.env.STRIPE_PRICE_PERSONAL_MONTHLY = 'price_monthly'
  process.env.STRIPE_PRICE_PERSONAL_ANNUAL = 'price_annual'
  process.env.STRIPE_PRICE_PERSONAL_LIFETIME = 'price_lifetime'
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

  // RL-042: the plans sold before the ladder are no longer on sale.
  it.each(['MONTHLY', 'ANNUAL', 'LIFETIME'])('refuses the retired %s plan', async (plan) => {
    const res = await POST(req({ plan }))
    expect(res.status).toBe(400)
    expect(mockCheckoutCreate).not.toHaveBeenCalled()
  })

  it('opens Personal at its own price and records the plan in the metadata', async () => {
    await POST(req({ plan: 'PERSONAL_MONTHLY' }))
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_monthly', quantity: 1 }],
        metadata: { userId: 'u1', plan: 'PERSONAL_MONTHLY' },
      })
    )
  })

  it('returns 400 when the user is already Pro', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'u1', email: 'u1@x.com', isPro: true, stripeCustomerId: 'cus_1' })
    const res = await POST(req({ plan: 'PERSONAL_MONTHLY' }))
    expect(res.status).toBe(400)
    expect(mockCheckoutCreate).not.toHaveBeenCalled()
  })

  it('creates a Stripe customer and saves it when the user has none yet', async () => {
    const res = await POST(req({ plan: 'PERSONAL_MONTHLY' }))
    expect(res.status).toBe(200)
    expect(mockCustomersCreate).toHaveBeenCalledWith({ email: 'u1@x.com', metadata: { userId: 'u1' } })
    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { stripeCustomerId: 'cus_new' } })
  })

  it('reuses an existing Stripe customer without creating a new one', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'u1', email: 'u1@x.com', isPro: false, stripeCustomerId: 'cus_existing' })
    await POST(req({ plan: 'PERSONAL_ANNUAL' }))
    expect(mockCustomersCreate).not.toHaveBeenCalled()
    expect(mockCheckoutCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_existing' }))
  })

  it('uses subscription mode for MONTHLY/ANNUAL and payment mode for LIFETIME', async () => {
    await POST(req({ plan: 'PERSONAL_LIFETIME' }))
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'payment', line_items: [{ price: 'price_lifetime', quantity: 1 }] })
    )
  })

  it('returns the checkout URL', async () => {
    const res = await POST(req({ plan: 'PERSONAL_MONTHLY' }))
    const body = await res.json()
    expect(body.url).toBe('https://checkout.stripe.com/session123')
  })
  // Going live after testing, or moving to another Stripe account, makes
  // every stored customer id meaningless. Nothing re-created them, so the
  // users who had already reached checkout once were the ones who could
  // never buy again.
  describe('when the stored Stripe customer no longer exists', () => {
    beforeEach(() => {
      mockUserFindUnique.mockResolvedValue({
        id: 'u1', email: 'u1@x.com', isPro: false, stripeCustomerId: 'cus_old',
      })
      mockCheckoutCreate
        .mockRejectedValueOnce(
          Object.assign(new Error('No such customer: cus_old'), {
            code: 'resource_missing',
            param: 'customer',
          })
        )
        .mockResolvedValue({ url: 'https://checkout.stripe.com/session456' })
    })

    it('replaces it and completes the checkout', async () => {
      const res = await POST(req({ plan: 'PERSONAL_MONTHLY' }))
      expect(res.status).toBe(200)
      expect(mockCustomersCreate).toHaveBeenCalledTimes(1)
      expect(mockCheckoutCreate.mock.calls[1][0].customer).toBe('cus_new')
    })

    it('saves the replacement so the next attempt does not repeat the work', async () => {
      await POST(req({ plan: 'PERSONAL_MONTHLY' }))
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { stripeCustomerId: 'cus_new' },
      })
    })

    it('gives up rather than looping if the replacement fails too', async () => {
      mockCheckoutCreate.mockReset()
      mockCheckoutCreate.mockRejectedValue(
        Object.assign(new Error('No such customer'), { code: 'resource_missing', param: 'customer' })
      )
      const res = await POST(req({ plan: 'PERSONAL_MONTHLY' }))
      expect(res.status).toBe(500)
      expect(mockCheckoutCreate).toHaveBeenCalledTimes(2)
    })

    // A mistyped Price id reports resource_missing too, and discarding a
    // good customer id over it would be a silent second bug.
    it('leaves the customer alone when it is the price that is missing', async () => {
      mockCheckoutCreate.mockReset()
      mockCheckoutCreate.mockRejectedValue(
        Object.assign(new Error('No such price: price_monthly'), {
          code: 'resource_missing',
          param: 'line_items[0][price]',
        })
      )
      const res = await POST(req({ plan: 'PERSONAL_MONTHLY' }))
      expect(res.status).toBe(500)
      expect(mockCheckoutCreate).toHaveBeenCalledTimes(1)
      expect(mockUserUpdate).not.toHaveBeenCalled()
    })
  })

  it('answers a misconfigured site with 503 rather than a payment failure', async () => {
    delete process.env.STRIPE_PRICE_PERSONAL_MONTHLY
    const res = await POST(req({ plan: 'PERSONAL_MONTHLY' }))
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('paymentsUnavailable')
    // And nothing was created at Stripe on the way to finding out.
    expect(mockCustomersCreate).not.toHaveBeenCalled()
  })
})
