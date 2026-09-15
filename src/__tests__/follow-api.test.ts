jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    follow: { upsert: jest.fn(), delete: jest.fn(), count: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST, DELETE } from '@/app/api/vehicles/[id]/follow/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockFollowUpsert = prisma.follow.upsert as jest.Mock
const mockFollowDelete = prisma.follow.delete as jest.Mock
const mockFollowCount = prisma.follow.count as jest.Mock

const params = { id: 'v1' }
function req() {
  return {} as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'follower' } })
  mockVehicleFindUnique.mockResolvedValue({ id: 'v1', isPublic: true, ownerId: 'owner' })
  mockFollowCount.mockResolvedValue(3)
})

describe('POST /api/vehicles/[id]/follow', () => {
  it('returns 404 when the vehicle is private', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', isPublic: false, ownerId: 'owner' })
    const res = await POST(req(), { params })
    expect(res.status).toBe(404)
    expect(mockFollowUpsert).not.toHaveBeenCalled()
  })

  it('returns 404 when the vehicle does not exist', async () => {
    mockVehicleFindUnique.mockResolvedValue(null)
    const res = await POST(req(), { params })
    expect(res.status).toBe(404)
  })

  it("rejects the owner following their own project", async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
    const res = await POST(req(), { params })
    expect(res.status).toBe(400)
    expect(mockFollowUpsert).not.toHaveBeenCalled()
  })

  it('upserts a follow and returns the new follower count', async () => {
    const res = await POST(req(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ following: true, followerCount: 3 })
    expect(mockFollowUpsert).toHaveBeenCalledWith({
      where: { vehicleId_followerUserId: { vehicleId: 'v1', followerUserId: 'follower' } },
      update: {},
      create: { vehicleId: 'v1', followerUserId: 'follower' },
    })
  })
})

describe('DELETE /api/vehicles/[id]/follow', () => {
  it('is idempotent when not following', async () => {
    mockFollowDelete.mockRejectedValue(new Error('not found'))
    mockFollowCount.mockResolvedValue(0)
    const res = await DELETE(req(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ following: false, followerCount: 0 })
  })

  it('removes the follow row', async () => {
    mockFollowDelete.mockResolvedValue({})
    mockFollowCount.mockResolvedValue(2)
    const res = await DELETE(req(), { params })
    expect(res.status).toBe(200)
    expect(mockFollowDelete).toHaveBeenCalledWith({
      where: { vehicleId_followerUserId: { vehicleId: 'v1', followerUserId: 'follower' } },
    })
  })
})
