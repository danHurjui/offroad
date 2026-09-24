jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { update: jest.fn() },
    donation: { updateMany: jest.fn() },
    organization: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  },
}))
jest.mock('@/lib/stripe', () => ({
  ...jest.requireActual('@/lib/stripe'),
  getStripe: jest.fn(),
}))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  paymentFailedEmail: jest.fn().mockResolvedValue({ subject: 's', html: '<p>x</p>' }),
  emailLocale: jest.fn().mockReturnValue('ro'),
}))

import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { sendEmail } from '@/lib/email'
import { POST } from '@/app/api/webhooks/stripe/route'

const mockUserUpdate = prisma.user.update as jest.Mock
const mockDonationUpdateMany = prisma.donation.updateMany as jest.Mock
const mockGetStripe = getStripe as jest.Mock
const mockConstructEvent = jest.fn()

function req(body: string, signature: string | null = 'sig_test') {
  return {
    headers: { get: (key: string) => (key === 'stripe-signature' ? signature : null) },
    text: () => Promise.resolve(body),
  } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  mockGetStripe.mockReturnValue({ webhooks: { constructEvent: mockConstructEvent } })
  mockUserUpdate.mockResolvedValue({ id: 'u1', email: 'u1@x.com' })
  mockDonationUpdateMany.mockResolvedValue({ count: 1 })
})

describe('POST /api/webhooks/stripe', () => {
  it('returns 400 when the signature header is missing', async () => {
    const res = await POST(req('{}', null))
    expect(res.status).toBe(400)
    expect(mockConstructEvent).not.toHaveBeenCalled()
  })

  it('returns 400 when signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('bad signature')
    })
    const res = await POST(req('{}'))
    expect(res.status).toBe(400)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('flips isPro on checkout.session.completed for a subscription', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          customer: 'cus_1',
          subscription: 'sub_1',
          metadata: { userId: 'u1', plan: 'PERSONAL_MONTHLY' },
        },
      },
    })
    const res = await POST(req('{}'))
    expect(res.status).toBe(200)
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isPro: true, proPlan: 'PERSONAL_MONTHLY', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', proPaymentFailedAt: null },
    })
  })

  // RL-042: a checkout for a retired plan, opened before the ladder shipped
  // and paid after it, still settles — the money was taken.
  it('flips isPro on checkout.session.completed for a (retired) lifetime payment, with no subscription id', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          customer: 'cus_1',
          subscription: null,
          metadata: { userId: 'u1', plan: 'LIFETIME' },
        },
      },
    })
    await POST(req('{}'))
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isPro: true, proPlan: 'LIFETIME', stripeCustomerId: 'cus_1', stripeSubscriptionId: undefined, proPaymentFailedAt: null },
    })
  })

  it('ignores checkout.session.completed with no userId metadata', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: { object: { mode: 'payment', customer: 'cus_1', metadata: {} } },
    })
    const res = await POST(req('{}'))
    expect(res.status).toBe(200)
    expect(mockUserUpdate).not.toHaveBeenCalled()
  })

  it('records a payment failure and emails the user', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1' } },
    })
    const res = await POST(req('{}'))
    expect(res.status).toBe(200)
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_1' },
      data: { proPaymentFailedAt: expect.any(Date) },
    })
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'u1@x.com' }))
  })

  it('clears the payment-failed flag on invoice.payment_succeeded', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_succeeded',
      data: { object: { customer: 'cus_1' } },
    })
    await POST(req('{}'))
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { stripeCustomerId: 'cus_1' },
      data: { proPaymentFailedAt: null },
    })
  })

  it('revokes Pro on customer.subscription.deleted', async () => {
    mockConstructEvent.mockReturnValue({
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_1' } },
    })
    await POST(req('{}'))
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { stripeSubscriptionId: 'sub_1' },
      data: { isPro: false, proPlan: null, stripeSubscriptionId: null },
    })
  })

  it('does not fail the webhook when no matching user is found', async () => {
    mockUserUpdate.mockRejectedValue(new Error('not found'))
    mockConstructEvent.mockReturnValue({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_unknown' } },
    })
    const res = await POST(req('{}'))
    expect(res.status).toBe(200)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('returns 200 for an unhandled event type', async () => {
    mockConstructEvent.mockReturnValue({ type: 'customer.created', data: { object: {} } })
    const res = await POST(req('{}'))
    expect(res.status).toBe(200)
  })

  describe('donations share checkout.session.completed with Pro purchases', () => {
    function donationEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_donation_1',
            mode: 'payment',
            metadata: { kind: 'donation', userId: '' },
            customer_details: { email: 'giver@example.com' },
            ...overrides,
          },
        },
      }
    }

    it('marks the donation PAID', async () => {
      mockConstructEvent.mockReturnValue(donationEvent())
      const res = await POST(req('{}'))
      expect(res.status).toBe(200)
      expect(mockDonationUpdateMany).toHaveBeenCalledWith({
        where: { stripeSessionId: 'cs_donation_1', status: 'PENDING' },
        data: expect.objectContaining({ status: 'PAID', email: 'giver@example.com' }),
      })
    })

    // The whole point of the `kind` tag: a donation must never grant Pro.
    it('never touches isPro', async () => {
      mockConstructEvent.mockReturnValue(donationEvent())
      await POST(req('{}'))
      expect(mockUserUpdate).not.toHaveBeenCalled()
    })

    it('ignores a Pro plan smuggled alongside the donation tag', async () => {
      mockConstructEvent.mockReturnValue(
        donationEvent({ metadata: { kind: 'donation', userId: 'u1', plan: 'LIFETIME' } })
      )
      await POST(req('{}'))
      expect(mockUserUpdate).not.toHaveBeenCalled()
      expect(mockDonationUpdateMany).toHaveBeenCalled()
    })

    // Stripe retries webhooks; the PENDING filter is what makes that a no-op.
    it('is idempotent across a redelivery', async () => {
      mockConstructEvent.mockReturnValue(donationEvent())
      await POST(req('{}'))
      mockDonationUpdateMany.mockResolvedValue({ count: 0 })
      const res = await POST(req('{}'))
      expect(res.status).toBe(200)
      expect(mockDonationUpdateMany.mock.calls[1][0].where.status).toBe('PENDING')
    })

    it('still processes a Pro purchase normally', async () => {
      mockConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: {
          object: { mode: 'payment', customer: 'cus_1', metadata: { userId: 'u1', plan: 'LIFETIME' } },
        },
      })
      await POST(req('{}'))
      expect(mockUserUpdate).toHaveBeenCalled()
      expect(mockDonationUpdateMany).not.toHaveBeenCalled()
    })
  })
})
