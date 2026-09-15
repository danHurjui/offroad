jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: { pushSubscription: { upsert: jest.fn(), deleteMany: jest.fn() } },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST as SUBSCRIBE } from '@/app/api/push/subscribe/route'
import { POST as UNSUBSCRIBE } from '@/app/api/push/unsubscribe/route'

const mockGetSession = getServerSession as jest.Mock
const mockUpsert = prisma.pushSubscription.upsert as jest.Mock
const mockDeleteMany = prisma.pushSubscription.deleteMany as jest.Mock

function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('POST /api/push/subscribe', () => {
  it('returns 400 for a malformed subscription', async () => {
    const res = await SUBSCRIBE(req({ endpoint: 'https://push.example.com/x' }))
    expect(res.status).toBe(400)
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('upserts the subscription by endpoint', async () => {
    mockUpsert.mockResolvedValue({})
    const res = await SUBSCRIBE(
      req({ endpoint: 'https://push.example.com/x', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } })
    )
    expect(res.status).toBe(201)
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example.com/x' },
      update: { userId: 'u1', p256dh: 'p256dh-key', auth: 'auth-key' },
      create: { userId: 'u1', endpoint: 'https://push.example.com/x', p256dh: 'p256dh-key', auth: 'auth-key' },
    })
  })
})

describe('POST /api/push/unsubscribe', () => {
  it('returns 400 without an endpoint', async () => {
    const res = await UNSUBSCRIBE(req({}))
    expect(res.status).toBe(400)
  })

  it('deletes only the caller-owned subscription for that endpoint', async () => {
    mockDeleteMany.mockResolvedValue({ count: 1 })
    const res = await UNSUBSCRIBE(req({ endpoint: 'https://push.example.com/x' }))
    expect(res.status).toBe(200)
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { endpoint: 'https://push.example.com/x', userId: 'u1' } })
  })
})
