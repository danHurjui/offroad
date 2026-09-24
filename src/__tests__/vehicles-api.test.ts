jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findMany: jest.fn(), count: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET, POST } from '@/app/api/vehicles/route'

const mockGetSession = getServerSession as jest.Mock
const mockFindMany = prisma.vehicle.findMany as jest.Mock
const mockCount = prisma.vehicle.count as jest.Mock
const mockCreate = prisma.vehicle.create as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockVehicleFindFirst = prisma.vehicle.findFirst as jest.Mock

function makePostReq(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVehicleFindFirst.mockResolvedValue(null) // no slug collision by default
})

describe('GET /api/vehicles', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns owned and collaborating vehicles', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    // listAccessibleVehicles: personal, company, collaborating.
    const updatedAt = new Date('2026-09-01')
    mockFindMany
      .mockResolvedValueOnce([{ id: 'v1', updatedAt }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'v2', updatedAt }])
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    // Money columns always arrive as numbers or null (pitfall #5).
    const money = { purchasePriceRon: null, currentValueRon: null, financeMonthlyRon: null }
    // The caller's `access` is not part of the vehicle's JSON.
    expect(data.owned).toEqual([{ id: 'v1', updatedAt: updatedAt.toISOString(), ...money }])
    expect(data.collaborating).toEqual([{ id: 'v2', updatedAt: updatedAt.toISOString(), ...money }])
  })
})

describe('POST /api/vehicles', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await POST(makePostReq({}))
    expect(res.status).toBe(401)
  })

  it('returns 400 for an invalid projectType', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await POST(makePostReq({ projectType: 'SUPABASE', make: 'Jeep', model: 'TJ', year: 2000 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for an out-of-range year', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    const res = await POST(makePostReq({ projectType: 'OFFROAD', make: 'Jeep', model: 'TJ', year: 1800 }))
    expect(res.status).toBe(400)
  })

  it('returns 403 with UPGRADE_REQUIRED when free tier already has 1 vehicle', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    mockUserFindUnique.mockResolvedValue({ isPro: false })
    mockCount.mockResolvedValue(1)
    const res = await POST(makePostReq({ projectType: 'OFFROAD', make: 'Jeep', model: 'TJ', year: 2000 }))
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.code).toBe('UPGRADE_REQUIRED')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('allows a second and third vehicle on Personal', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    mockUserFindUnique.mockResolvedValue({ isPro: true, isProComped: false, proPlan: 'PERSONAL_MONTHLY', grandfatheredAt: null })
    mockCount.mockResolvedValue(2)
    mockCreate.mockResolvedValue({ id: 'v3' })
    const res = await POST(makePostReq({ projectType: 'OFFROAD', make: 'Jeep', model: 'TJ', year: 2000 }))
    expect(res.status).toBe(201)
  })

  it('refuses a fourth vehicle on Personal, naming its allowance', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    mockUserFindUnique.mockResolvedValue({ isPro: true, isProComped: false, proPlan: 'PERSONAL_MONTHLY', grandfatheredAt: null })
    mockCount.mockResolvedValue(3)
    const res = await POST(makePostReq({ projectType: 'OFFROAD', make: 'Jeep', model: 'TJ', year: 2000 }))
    const data = await res.json()
    expect(res.status).toBe(403)
    expect(data.code).toBe('UPGRADE_REQUIRED')
    expect(data.error).toMatch(/3/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  // RL-042: everyone who held Pro before the ladder keeps it uncapped.
  it.each([
    ['a legacy subscriber', { isPro: true, isProComped: false, proPlan: 'MONTHLY' }],
    ['a founding member', { isPro: false, isProComped: true, proPlan: null }],
  ])('never counts vehicles for %s', async (_label, flags) => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    mockUserFindUnique.mockResolvedValue({ ...flags, grandfatheredAt: new Date('2026-10-03') })
    mockCount.mockResolvedValue(40)
    mockCreate.mockResolvedValue({ id: 'v41' })
    const res = await POST(makePostReq({ projectType: 'OFFROAD', make: 'Jeep', model: 'TJ', year: 2000 }))
    expect(res.status).toBe(201)
    expect(mockCount).not.toHaveBeenCalled()
  })

  it('creates a vehicle for a free user with no existing vehicles', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    mockUserFindUnique.mockResolvedValue({ isPro: false })
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue({ id: 'v1', ownerId: 'u1', projectType: 'OFFROAD' })
    const res = await POST(makePostReq({ projectType: 'OFFROAD', make: 'Jeep', model: 'TJ', year: 2000 }))
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.id).toBe('v1')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ownerId: 'u1', projectType: 'OFFROAD' }) })
    )
  })

  it('generates a slug for the public URL', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    mockUserFindUnique.mockResolvedValue({ isPro: false })
    mockCount.mockResolvedValue(0)
    mockCreate.mockResolvedValue({ id: 'v1' })
    await POST(makePostReq({ projectType: 'OFFROAD', make: 'Jeep', model: 'Wrangler TJ', year: 2000 }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: '2000-jeep-wrangler-tj' }) })
    )
  })

  it('appends a numeric suffix when the slug collides for the same owner', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
    mockUserFindUnique.mockResolvedValue({ isPro: false })
    mockCount.mockResolvedValue(0)
    mockVehicleFindFirst.mockResolvedValueOnce({ id: 'existing' }).mockResolvedValueOnce(null)
    mockCreate.mockResolvedValue({ id: 'v2' })
    await POST(makePostReq({ projectType: 'OFFROAD', make: 'Jeep', model: 'TJ', year: 2000 }))
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: '2000-jeep-tj-2' }) })
    )
  })
})
