jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    foundState: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET, PUT } from '@/app/api/vehicles/[id]/found-state/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockFoundStateFindUnique = prisma.foundState.findUnique as jest.Mock
const mockUpsert = prisma.foundState.upsert as jest.Mock

const params = { id: 'v1' }

function makePutReq(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
})

describe('GET /api/vehicles/[id]/found-state', () => {
  it('returns 400 for an off-road vehicle', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', ownerId: 'u1', projectType: 'OFFROAD' })
    const res = await GET({} as never, { params })
    expect(res.status).toBe(400)
  })

  it('returns null when no found state exists yet', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', ownerId: 'u1', projectType: 'RESTORATION' })
    mockFoundStateFindUnique.mockResolvedValue(null)
    const res = await GET({} as never, { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data).toBeNull()
  })
})

describe('PUT /api/vehicles/[id]/found-state', () => {
  it('returns 400 when acquisitionDate is missing', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', ownerId: 'u1', projectType: 'RESTORATION' })
    const res = await PUT(makePutReq({}), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for an out-of-range conditionRating', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', ownerId: 'u1', projectType: 'RESTORATION' })
    const res = await PUT(makePutReq({ acquisitionDate: '2025-01-01', conditionRating: 9 }), { params })
    expect(res.status).toBe(400)
  })

  it('upserts and serializes purchasePriceRon', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', ownerId: 'u1', projectType: 'RESTORATION' })
    mockUpsert.mockResolvedValue({
      id: 'fs1', vehicleId: 'v1', purchasePriceRon: { toNumber: () => 1500 }, photos: [],
    })
    const res = await PUT(makePutReq({ acquisitionDate: '2025-01-01', purchasePriceRon: 1500 }), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.purchasePriceRon).toBe(1500)
  })
})
