// RL-042: the read-only gate reads the owner's plan and vehicles, which
// these mocks do not model; readOnly.test.ts tests it on its own.
jest.mock('@/lib/vehicleAllowance', () => ({
  ...jest.requireActual('@/lib/vehicleAllowance'),
  refuseIfReadOnly: jest.fn(async () => null),
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    wishlistItem: { findUnique: jest.fn(), update: jest.fn() },
    wishlistPriceEntry: { findMany: jest.fn(), create: jest.fn() },
    pushSubscription: { delete: jest.fn() },
  },
}))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
  priceAlertEmail: jest.fn().mockResolvedValue({ subject: 's', html: '<p>x</p>' }),
  emailLocale: jest.fn().mockReturnValue('ro'),
}))
// The email/notification path builds its translator directly from the
// catalogue (src/i18n/translator.ts), so there is no request context to
// stub — only a locale to pass.
jest.mock('@/i18n/translator', () => ({
  translator: jest.fn().mockResolvedValue((key: string) => `t:${key}`),
}))
jest.mock('@/lib/webpush', () => ({ sendPushNotification: jest.fn() }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendPushNotification } from '@/lib/webpush'
import { GET, POST } from '@/app/api/vehicles/[id]/wishlist/[itemId]/price/route'
import { PATCH as itemPatch } from '@/app/api/vehicles/[id]/wishlist/[itemId]/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockItemFindUnique = prisma.wishlistItem.findUnique as jest.Mock
const mockItemUpdate = prisma.wishlistItem.update as jest.Mock
const mockEntryFindMany = prisma.wishlistPriceEntry.findMany as jest.Mock
const mockEntryCreate = prisma.wishlistPriceEntry.create as jest.Mock
const mockSendEmail = sendEmail as jest.Mock
const mockSendPush = sendPushNotification as jest.Mock

const VEHICLE = {
  id: 'v1', ownerId: 'owner', year: 2005, make: 'Jeep', model: 'Wrangler',
  owner: { email: 'owner@example.com', pushSubscriptions: [] },
}
const params = { id: 'v1', itemId: 'w1' }

function req(body?: unknown) {
  return { json: () => Promise.resolve(body ?? {}) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
  mockUserFindUnique.mockResolvedValue({ isPro: true })
  mockSendPush.mockResolvedValue('sent')
  mockSendEmail.mockResolvedValue(undefined)
})

describe('GET /api/vehicles/[id]/wishlist/[itemId]/price', () => {
  it('serializes price entries to numbers', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'w1', vehicleId: 'v1' })
    mockEntryFindMany.mockResolvedValue([{ id: 'e1', priceRon: { toNumber: () => 300 } }])
    const res = await GET(req(), { params })
    const data = await res.json()
    expect(data[0].priceRon).toBe(300)
  })
})

describe('POST /api/vehicles/[id]/wishlist/[itemId]/price', () => {
  it('returns 403 UPGRADE_REQUIRED for a free-tier owner', async () => {
    mockUserFindUnique.mockResolvedValue({ isPro: false })
    const res = await POST(req({ priceRon: 100 }), { params })
    expect(res.status).toBe(403)
    expect(mockEntryCreate).not.toHaveBeenCalled()
  })

  it('returns 400 for a non-positive price', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'w1', vehicleId: 'v1', targetPriceRon: null, priceAlertSentAt: null })
    const res = await POST(req({ priceRon: 0 }), { params })
    expect(res.status).toBe(400)
  })

  it('logs a price without notifying when there is no target', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'w1', vehicleId: 'v1', name: 'Winch', targetPriceRon: null, priceAlertSentAt: null })
    mockEntryCreate.mockResolvedValue({ id: 'e1', priceRon: { toNumber: () => 400 } })
    const res = await POST(req({ priceRon: 400 }), { params })
    expect(res.status).toBe(201)
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockItemUpdate).not.toHaveBeenCalled()
  })

  it('notifies and marks priceAlertSentAt the first time price drops to target', async () => {
    mockItemFindUnique.mockResolvedValue({
      id: 'w1', vehicleId: 'v1', name: 'Winch',
      targetPriceRon: { toNumber: () => 500 }, priceAlertSentAt: null,
    })
    mockEntryCreate.mockResolvedValue({ id: 'e1', priceRon: { toNumber: () => 450 } })
    mockItemUpdate.mockResolvedValue({})
    const res = await POST(req({ priceRon: 450 }), { params })
    expect(res.status).toBe(201)
    expect(mockItemUpdate).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { priceAlertSentAt: expect.any(Date) } })
    expect(mockSendEmail).toHaveBeenCalled()
  })

  it('does not re-notify once already sent', async () => {
    mockItemFindUnique.mockResolvedValue({
      id: 'w1', vehicleId: 'v1', name: 'Winch',
      targetPriceRon: { toNumber: () => 500 }, priceAlertSentAt: new Date(),
    })
    mockEntryCreate.mockResolvedValue({ id: 'e2', priceRon: { toNumber: () => 300 } })
    const res = await POST(req({ priceRon: 300 }), { params })
    expect(res.status).toBe(201)
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockItemUpdate).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/vehicles/[id]/wishlist/[itemId] target price rearm', () => {
  it('clears priceAlertSentAt when targetPriceRon changes', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'w1', vehicleId: 'v1' })
    mockItemUpdate.mockResolvedValue({ id: 'w1', estimatedCostRon: null, targetPriceRon: { toNumber: () => 600 } })
    await itemPatch(req({ targetPriceRon: 600 }), { params: { id: 'v1', itemId: 'w1' } })
    expect(mockItemUpdate).toHaveBeenCalledWith({
      where: { id: 'w1' },
      data: { targetPriceRon: 600, priceAlertSentAt: null },
    })
  })
})
