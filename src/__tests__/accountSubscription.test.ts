jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), delete: jest.fn() },
    organization: { findMany: jest.fn(), deleteMany: jest.fn() },
    organizationMember: { findMany: jest.fn(), findFirst: jest.fn() },
    vehicle: { findMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/personalData', () => ({ collectStorageKeys: jest.fn(), deleteStoredFiles: jest.fn() }))
jest.mock('@/lib/stripe', () => ({ ...jest.requireActual('@/lib/stripe'), getStripe: jest.fn() }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { collectStorageKeys, deleteStoredFiles } from '@/lib/personalData'
import { getStripe, StripeConfigError } from '@/lib/stripe'
import { cancelPersonalSubscriptions } from '@/lib/accountBilling'
import { DELETE as deleteAccount } from '@/app/api/me/account/route'

const mockGetStripe = getStripe as jest.Mock
const user = prisma.user as unknown as Record<string, jest.Mock>
const list = jest.fn()
const retrieve = jest.fn()
const cancel = jest.fn()

const missing = (message: string, param?: string) => Object.assign(new Error(message), { code: 'resource_missing', param })
function subs(...rows: Array<{ id: string; status: string }>) {
  return (async function* () {
    yield* rows
  })()
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetStripe.mockReturnValue({ subscriptions: { list, retrieve, cancel } })
  list.mockImplementation(() => subs())
  cancel.mockResolvedValue({})
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'me', active: true } })
  ;(prisma.organizationMember.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.vehicle.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.$transaction as jest.Mock).mockResolvedValue([])
  ;(collectStorageKeys as jest.Mock).mockResolvedValue([])
  ;(deleteStoredFiles as jest.Mock).mockResolvedValue(undefined)
})

describe('cancelPersonalSubscriptions', () => {
  it('does not touch Stripe for an account that never paid, or paid once (Lifetime)', async () => {
    expect(await cancelPersonalSubscriptions({ stripeCustomerId: null, stripeSubscriptionId: null })).toEqual([])
    expect(mockGetStripe).not.toHaveBeenCalled()
    expect(await cancelPersonalSubscriptions({ stripeCustomerId: 'cus_1', stripeSubscriptionId: null })).toEqual([])
    expect(cancel).not.toHaveBeenCalled()
  })

  it('cancels every live subscription on the customer, not just the stored one', async () => {
    list.mockImplementation(() =>
      subs({ id: 'sub_new', status: 'active' }, { id: 'sub_twin', status: 'past_due' }, { id: 'sub_old', status: 'canceled' })
    )
    const done = await cancelPersonalSubscriptions({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_new' })
    expect(done.sort()).toEqual(['sub_new', 'sub_twin'])
    expect(list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'all', limit: 100 })
    expect(cancel).not.toHaveBeenCalledWith('sub_old')
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('still cancels the stored subscription when the customer is not the one it was made under', async () => {
    list.mockImplementation(() => {
      throw missing('No such customer: cus_gone', 'customer')
    })
    retrieve.mockResolvedValue({ id: 'sub_1', status: 'active' })
    expect(await cancelPersonalSubscriptions({ stripeCustomerId: 'cus_gone', stripeSubscriptionId: 'sub_1' })).toEqual(['sub_1'])
  })

  it('treats a subscription Stripe does not know as already over', async () => {
    retrieve.mockRejectedValue(missing('No such subscription: sub_1'))
    expect(await cancelPersonalSubscriptions({ stripeCustomerId: null, stripeSubscriptionId: 'sub_1' })).toEqual([])
    expect(cancel).not.toHaveBeenCalled()
  })

  it('throws on anything else, so the account is not deleted under a live charge', async () => {
    list.mockImplementation(() => subs({ id: 'sub_1', status: 'active' }))
    cancel.mockRejectedValue(Object.assign(new Error('boom'), { type: 'StripeAPIError' }))
    await expect(cancelPersonalSubscriptions({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' })).rejects.toThrow('boom')
  })
})

describe('DELETE /api/me/account and a Personal subscription', () => {
  it('cancels the subscription, then deletes the account', async () => {
    user.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' })
    list.mockImplementation(() => subs({ id: 'sub_1', status: 'active' }))
    const order: string[] = []
    cancel.mockImplementation(async () => order.push('cancel'))
    ;(prisma.$transaction as jest.Mock).mockImplementation(async () => order.push('delete'))
    expect((await deleteAccount()).status).toBe(200)
    expect(cancel).toHaveBeenCalledWith('sub_1')
    expect(order).toEqual(['cancel', 'delete'])
  })

  it('deletes nothing when Stripe cannot cancel it', async () => {
    user.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' })
    list.mockImplementation(() => subs({ id: 'sub_1', status: 'active' }))
    cancel.mockRejectedValue(Object.assign(new Error('Stripe is down'), { type: 'StripeConnectionError' }))
    const res = await deleteAccount()
    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('subscriptionCancelFailed')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(deleteStoredFiles).not.toHaveBeenCalled()
  })

  it('deletes nothing when Stripe is not configured but a subscription is on record', async () => {
    user.findUnique.mockResolvedValue({ stripeCustomerId: null, stripeSubscriptionId: 'sub_1' })
    mockGetStripe.mockImplementation(() => {
      throw new StripeConfigError('STRIPE_SECRET_KEY', 'not set')
    })
    expect((await deleteAccount()).status).toBe(503)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('never reaches Stripe for an account with no billing', async () => {
    user.findUnique.mockResolvedValue({ stripeCustomerId: null, stripeSubscriptionId: null })
    expect((await deleteAccount()).status).toBe(200)
    expect(mockGetStripe).not.toHaveBeenCalled()
  })

  it('refuses over a paying organisation before cancelling anything', async () => {
    ;(prisma.organizationMember.findMany as jest.Mock).mockResolvedValue([
      { role: 'OWNER', organization: { id: 'solo', name: 'Solo SRL', members: [{ role: 'OWNER' }] } },
    ])
    ;(prisma.organization.findMany as jest.Mock).mockResolvedValue([{ id: 'solo', name: 'Solo SRL' }])
    user.findUnique.mockResolvedValue({ stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' })
    expect((await deleteAccount()).status).toBe(409)
    expect(cancel).not.toHaveBeenCalled()
  })
})
