jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    organization: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    vehicle: { findUnique: jest.fn(), count: jest.fn(), updateMany: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    donation: { updateMany: jest.fn() },
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

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { getStripe } from '@/lib/stripe'
import { sendEmail } from '@/lib/email'
import { ORG_PLAN_IDS, ORG_PLANS } from '@/lib/plans'
import { POST as checkout } from '@/app/api/organizations/[orgId]/billing/checkout/route'
import { POST as portal } from '@/app/api/organizations/[orgId]/billing/portal/route'
import { POST as webhook } from '@/app/api/webhooks/stripe/route'
import { POST as moveIn } from '@/app/api/vehicles/[id]/organization/route'

const mockSession = getServerSession as jest.Mock
const mockGetStripe = getStripe as jest.Mock
const member = prisma.organizationMember.findUnique as jest.Mock
const org = prisma.organization as unknown as Record<string, jest.Mock>
const vehicle = prisma.vehicle as unknown as Record<string, jest.Mock>
const userUpdate = prisma.user.update as jest.Mock

const customersCreate = jest.fn()
const sessionsCreate = jest.fn()
const portalCreate = jest.fn()
const constructEvent = jest.fn()

const ORG = {
  id: 'o1',
  name: 'Transport SRL',
  cui: 'RO14399840',
  plan: null,
  compedAt: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  paymentFailedAt: null,
}
const params = { params: { orgId: 'o1' } }
const body = (b: unknown) => ({ json: () => Promise.resolve(b) }) as never
const as = (role: string, orgOver: Record<string, unknown> = {}) =>
  member.mockResolvedValue({ role, organization: { ...ORG, ...orgOver } })
const event = (e: unknown) => {
  constructEvent.mockReturnValue(e)
  return {
    headers: { get: (k: string) => (k === 'stripe-signature' ? 'sig' : null) },
    text: () => Promise.resolve('{}'),
  } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
  for (const plan of ORG_PLAN_IDS) process.env[ORG_PLANS[plan].envVar] = `price_${plan.toLowerCase()}`
  mockSession.mockResolvedValue({ user: { id: 'me', email: 'boss@x.ro', active: true } })
  mockGetStripe.mockReturnValue({
    customers: { create: customersCreate },
    checkout: { sessions: { create: sessionsCreate } },
    billingPortal: { sessions: { create: portalCreate } },
    webhooks: { constructEvent },
  })
  customersCreate.mockResolvedValue({ id: 'cus_org' })
  sessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/x' })
  portalCreate.mockResolvedValue({ url: 'https://billing.stripe.com/x' })
  org.updateMany.mockResolvedValue({ count: 1 })
  userUpdate.mockRejectedValue(new Error('no such user'))
})

describe('the organisation checkout', () => {
  it('is a 404 to somebody outside the organisation', async () => {
    member.mockResolvedValue(null)
    expect((await checkout(body({ plan: 'PRO_MONTHLY' }), params)).status).toBe(404)
  })

  it('is refused to a fleet manager — owners hold the card', async () => {
    as('FLEET_MANAGER')
    const res = await checkout(body({ plan: 'PRO_MONTHLY' }), params)
    expect(res.status).toBe(403)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('sells only company plans', async () => {
    as('OWNER')
    expect((await checkout(body({ plan: 'PERSONAL_MONTHLY' }), params)).status).toBe(400)
  })

  it('has nothing to sell a comped organisation, and does not sell a second plan', async () => {
    as('OWNER', { compedAt: new Date() })
    expect((await checkout(body({ plan: 'PRO_MONTHLY' }), params)).status).toBe(400)
    as('OWNER', { stripeSubscriptionId: 'sub_1' })
    expect((await checkout(body({ plan: 'PRO_MONTHLY' }), params)).status).toBe(409)
    expect(sessionsCreate).not.toHaveBeenCalled()
  })

  it('bills the organisation’s own customer, never the owner’s', async () => {
    as('OWNER')
    const res = await checkout(body({ plan: 'FLEET_250_ANNUAL' }), params)
    expect(res.status).toBe(200)
    expect(customersCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Transport SRL', metadata: expect.objectContaining({ orgId: 'o1' }) }))
    expect(org.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { stripeCustomerId: 'cus_org' } })
    expect(userUpdate).not.toHaveBeenCalled()
    expect(sessionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_org',
        mode: 'subscription',
        line_items: [{ price: 'price_fleet_250_annual', quantity: 1 }],
        metadata: { kind: 'organization', orgId: 'o1', plan: 'FLEET_250_ANNUAL' },
      })
    )
  })

  it('answers 503 when the plan’s Price is not configured', async () => {
    as('OWNER')
    delete process.env.STRIPE_PRICE_ORG_BUSINESS_MONTHLY
    expect((await checkout(body({ plan: 'BUSINESS_MONTHLY' }), params)).status).toBe(503)
    expect(customersCreate).not.toHaveBeenCalled()
  })
})

describe('the organisation billing portal', () => {
  it('is the owners’', async () => {
    as('FLEET_MANAGER', { stripeCustomerId: 'cus_org' })
    expect((await portal(body({}), params)).status).toBe(403)
    as('OWNER', { stripeCustomerId: 'cus_org' })
    const res = await portal(body({}), params)
    expect(res.status).toBe(200)
    expect(portalCreate).toHaveBeenCalledWith(expect.objectContaining({ customer: 'cus_org' }))
  })
})

describe('the webhook, for organisations', () => {
  it('writes the plan on the organisation and never grants a member isPro', async () => {
    const res = await webhook(
      event({
        type: 'checkout.session.completed',
        data: {
          object: {
            mode: 'subscription',
            customer: 'cus_org',
            subscription: 'sub_org',
            metadata: { kind: 'organization', orgId: 'o1', plan: 'BUSINESS_MONTHLY', userId: 'me' },
          },
        },
      })
    )
    expect(res.status).toBe(200)
    expect(org.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { plan: 'BUSINESS_MONTHLY', stripeCustomerId: 'cus_org', stripeSubscriptionId: 'sub_org', paymentFailedAt: null },
    })
    expect(userUpdate).not.toHaveBeenCalled()
  })

  it('ignores an organisation checkout naming no real plan', async () => {
    await webhook(
      event({ type: 'checkout.session.completed', data: { object: { metadata: { kind: 'organization', orgId: 'o1', plan: 'PERSONAL_MONTHLY' } } } })
    )
    expect(org.updateMany).not.toHaveBeenCalled()
    expect(userUpdate).not.toHaveBeenCalled()
  })

  it('follows a plan changed in the portal by its Price', async () => {
    await webhook(
      event({
        type: 'customer.subscription.updated',
        data: { object: { id: 'sub_org', items: { data: [{ price: { id: 'price_fleet_500_monthly' } }] } } },
      })
    )
    expect(org.updateMany).toHaveBeenCalledWith({ where: { stripeSubscriptionId: 'sub_org' }, data: { plan: 'FLEET_500_MONTHLY' } })
  })

  it('changes nothing for a Price it does not know', async () => {
    await webhook(
      event({ type: 'customer.subscription.updated', data: { object: { id: 'sub_x', items: { data: [{ price: { id: 'price_other' } }] } } } })
    )
    expect(org.updateMany).not.toHaveBeenCalled()
  })

  it('ends the plan when the subscription goes, keeping the organisation', async () => {
    await webhook(event({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_org' } } }))
    expect(org.updateMany).toHaveBeenCalledWith({ where: { stripeSubscriptionId: 'sub_org' }, data: { plan: null, stripeSubscriptionId: null } })
  })

  it('marks a failed payment and emails each owner', async () => {
    org.findUnique.mockResolvedValue({
      id: 'o1',
      members: [{ user: { email: 'a@x.ro', locale: 'ro' } }, { user: { email: 'b@x.ro', locale: 'en' } }],
    })
    const res = await webhook(event({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_org' } } }))
    expect(res.status).toBe(200)
    expect(org.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { paymentFailedAt: expect.any(Date) } })
    expect((sendEmail as jest.Mock).mock.calls.map((c) => c[0].to)).toEqual(['a@x.ro', 'b@x.ro'])
    expect(userUpdate).not.toHaveBeenCalled()
  })
})

describe('moving a vehicle into an organisation', () => {
  beforeEach(() => {
    vehicle.findUnique.mockResolvedValue({ id: 'v1', ownerId: 'me', organizationId: null })
    member.mockResolvedValue({ role: 'OWNER' })
    vehicle.updateMany.mockResolvedValue({ count: 1 })
  })

  it('needs a plan', async () => {
    org.findUnique.mockResolvedValue({ plan: null, compedAt: null })
    const res = await moveIn(body({ organizationId: 'o1' }), { params: { id: 'v1' } })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('ORG_PLAN_REQUIRED')
    expect(vehicle.updateMany).not.toHaveBeenCalled()
  })

  it('stops at the plan’s allowance', async () => {
    org.findUnique.mockResolvedValue({ plan: 'PRO_MONTHLY', compedAt: null })
    vehicle.count.mockResolvedValue(10)
    expect((await moveIn(body({ organizationId: 'o1' }), { params: { id: 'v1' } })).status).toBe(403)
    vehicle.count.mockResolvedValue(9)
    expect((await moveIn(body({ organizationId: 'o1' }), { params: { id: 'v1' } })).status).toBe(200)
  })

  it('is unlimited for a comped (beta) organisation', async () => {
    org.findUnique.mockResolvedValue({ plan: null, compedAt: new Date() })
    expect((await moveIn(body({ organizationId: 'o1' }), { params: { id: 'v1' } })).status).toBe(200)
    expect(vehicle.count).not.toHaveBeenCalled()
  })
})
