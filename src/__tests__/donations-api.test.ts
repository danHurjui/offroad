jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    donation: { create: jest.fn(), updateMany: jest.fn() },
  },
}))
jest.mock('@/lib/stripe', () => ({
  getStripe: jest.fn(),
  isProPlanId: jest.requireActual('@/lib/stripe').isProPlanId,
}))
jest.mock('@/lib/email', () => ({ sendEmail: jest.fn(), paymentFailedEmailHtml: jest.fn() }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { POST as donateCheckout } from '@/app/api/donations/checkout/route'

const mockSession = getServerSession as jest.Mock
const mockGetStripe = getStripe as jest.Mock
const mockDonationCreate = prisma.donation.create as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock

const sessionsCreate = jest.fn()

function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  sessionsCreate.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.test/cs_test_1' })
  mockGetStripe.mockReturnValue({ checkout: { sessions: { create: sessionsCreate } } })
  mockSession.mockResolvedValue(null)
  mockDonationCreate.mockResolvedValue({ id: 'd1' })
})

describe('POST /api/donations/checkout', () => {
  it('works without a session — donating needs no account', async () => {
    const res = await donateCheckout(req({ amountRon: 50 }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/cs_test_1' })
  })

  it('charges the requested amount in bani', async () => {
    await donateCheckout(req({ amountRon: 50 }))
    const args = sessionsCreate.mock.calls[0][0]
    expect(args.mode).toBe('payment')
    expect(args.line_items[0].price_data.unit_amount).toBe(5000)
    expect(args.line_items[0].price_data.currency).toBe('ron')
  })

  // Amount validation is server-side because the client chooses it.
  it.each([
    ['zero', 0],
    ['a negative amount', -100],
    ['a non-numeric string', 'free'],
    ['an absurd amount above the cap', 999_999],
    ['below the minimum', 1],
    ['missing', undefined],
  ])('rejects %s without creating a session', async (_label, amountRon) => {
    const res = await donateCheckout(req({ amountRon }))
    expect(res.status).toBe(400)
    expect(sessionsCreate).not.toHaveBeenCalled()
    expect(mockDonationCreate).not.toHaveBeenCalled()
  })

  it('records the donation as PENDING, never PAID', async () => {
    await donateCheckout(req({ amountRon: 100 }))
    const data = mockDonationCreate.mock.calls[0][0].data
    expect(data.amountBani).toBe(10000)
    expect(data.stripeSessionId).toBe('cs_test_1')
    // status is left to the schema default (PENDING) and only the webhook
    // moves it to PAID.
    expect(data.status).toBeUndefined()
    expect(data.paidAt).toBeUndefined()
  })

  it('tags the session so the webhook can tell it from a Pro purchase', async () => {
    await donateCheckout(req({ amountRon: 25 }))
    expect(sessionsCreate.mock.calls[0][0].metadata.kind).toBe('donation')
  })

  it('attributes the donation when logged in', async () => {
    mockSession.mockResolvedValue({ user: { id: 'u1' } })
    mockUserFindUnique.mockResolvedValue({ id: 'u1', email: 'a@b.com', stripeCustomerId: null })
    await donateCheckout(req({ amountRon: 25 }))
    expect(mockDonationCreate.mock.calls[0][0].data.userId).toBe('u1')
  })

  it('leaves a guest donation unattributed', async () => {
    await donateCheckout(req({ amountRon: 25 }))
    expect(mockDonationCreate.mock.calls[0][0].data.userId).toBeNull()
  })

  it('truncates an over-long public message', async () => {
    await donateCheckout(req({ amountRon: 25, message: 'x'.repeat(500) }))
    expect(mockDonationCreate.mock.calls[0][0].data.message).toHaveLength(280)
  })

  it('honours the anonymous flag', async () => {
    await donateCheckout(req({ amountRon: 25, isAnonymous: true }))
    expect(mockDonationCreate.mock.calls[0][0].data.isAnonymous).toBe(true)
  })

  // A donation must never be able to claim a Pro plan for itself.
  it('does not let a client smuggle a Pro plan into the metadata', async () => {
    await donateCheckout(req({ amountRon: 25, plan: 'LIFETIME', kind: 'pro' }))
    const metadata = sessionsCreate.mock.calls[0][0].metadata
    expect(metadata.kind).toBe('donation')
    expect(metadata.plan).toBeUndefined()
  })
})
