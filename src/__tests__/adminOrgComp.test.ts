jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: { organization: { findUnique: jest.fn(), update: jest.fn() } },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/admin/organizations/[orgId]/route'

const session = getServerSession as jest.Mock
const org = prisma.organization as unknown as Record<string, jest.Mock>
const req = (b: unknown) => ({ json: () => Promise.resolve(b) }) as never
const params = { params: { orgId: 'o1' } }

beforeEach(() => {
  jest.clearAllMocks()
  session.mockResolvedValue({ user: { id: 'admin', active: true, isAdmin: true } })
  org.findUnique.mockResolvedValue({ id: 'o1', compedAt: null, stripeSubscriptionId: null })
  org.update.mockImplementation(async ({ data }) => ({ id: 'o1', ...data }))
})

describe('PATCH /api/admin/organizations/[orgId]', () => {
  it('is a 404 to anyone who is not an admin', async () => {
    session.mockResolvedValue({ user: { id: 'me', active: true, isAdmin: false } })
    expect((await PATCH(req({ comped: true }), params)).status).toBe(404)
    expect(org.update).not.toHaveBeenCalled()
  })

  it('comps an organisation, and changes nothing else it is sent', async () => {
    const res = await PATCH(req({ comped: true, plan: 'FLEET_500_ANNUAL', name: 'x' }), params)
    expect(res.status).toBe(200)
    expect(org.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { compedAt: expect.any(Date) }, select: { id: true, compedAt: true } })
  })

  it('ends a comp', async () => {
    org.findUnique.mockResolvedValue({ id: 'o1', compedAt: new Date(), stripeSubscriptionId: null })
    expect((await PATCH(req({ comped: false }), params)).status).toBe(200)
    expect(org.update.mock.calls[0][0].data).toEqual({ compedAt: null })
  })

  it('refuses comping one that pays, which Stripe would go on charging', async () => {
    org.findUnique.mockResolvedValue({ id: 'o1', compedAt: null, stripeSubscriptionId: 'sub_1' })
    const res = await PATCH(req({ comped: true }), params)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('orgCompWhilePaying')
    expect(org.update).not.toHaveBeenCalled()
  })

  it('keeps the original date when asked for the state it is already in', async () => {
    const since = new Date('2026-01-01')
    org.findUnique.mockResolvedValue({ id: 'o1', compedAt: since, stripeSubscriptionId: null })
    const res = await PATCH(req({ comped: true }), params)
    expect(res.status).toBe(200)
    expect(org.update).not.toHaveBeenCalled()
  })

  it('needs a boolean, and a real organisation', async () => {
    expect((await PATCH(req({ comped: 'yes' }), params)).status).toBe(400)
    org.findUnique.mockResolvedValue(null)
    expect((await PATCH(req({ comped: true }), params)).status).toBe(404)
  })
})
