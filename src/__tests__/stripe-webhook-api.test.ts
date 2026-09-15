jest.mock('@/lib/prisma', () => ({
  prisma: { user: { update: jest.fn() } },
}))
jest.mock('@/lib/stripe', () => ({
  ...jest.requireActual('@/lib/stripe'),
  getStripe: jest.fn(),
}))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  paymentFailedEmailHtml: jest.fn().mockReturnValue('<p>failed</p>'),
}))

import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { sendEmail } from '@/lib/email'
import { POST } from '@/app/api/webhooks/stripe/route'

const mockUserUpdate = prisma.user.update as jest.Mock
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
          metadata: { userId: 'u1', plan: 'MONTHLY' },
        },
      },
    })
    const res = await POST(req('{}'))
    expect(res.status).toBe(200)
    expect(mockUserUpdate).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { isPro: true, proPlan: 'MONTHLY', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1', proPaymentFailedAt: null },
    })
  })

  it('flips isPro on checkout.session.completed for a lifetime payment, with no subscription id', async () => {
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
})
