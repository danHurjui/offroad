jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    trailRun: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  },
}))
jest.mock('@/lib/storage', () => ({ ...jest.requireActual('@/lib/storage'), deleteUpload: jest.fn().mockResolvedValue(undefined) }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET as listGet, POST as listPost } from '@/app/api/vehicles/[id]/trail-runs/route'
import { GET as detailGet, DELETE as detailDelete } from '@/app/api/vehicles/[id]/trail-runs/[runId]/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockRunFindMany = prisma.trailRun.findMany as jest.Mock
const mockRunFindUnique = prisma.trailRun.findUnique as jest.Mock
const mockRunCreate = prisma.trailRun.create as jest.Mock
const mockRunDelete = prisma.trailRun.delete as jest.Mock

const OFFROAD_VEHICLE = { id: 'v1', ownerId: 'owner', projectType: 'OFFROAD' }
const params = { id: 'v1' }

function req(body?: unknown) {
  return { json: () => Promise.resolve(body ?? {}) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(OFFROAD_VEHICLE)
  mockUserFindUnique.mockResolvedValue({ isPro: true })
})

describe('GET /api/vehicles/[id]/trail-runs', () => {
  it('returns 400 for a restoration vehicle', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...OFFROAD_VEHICLE, projectType: 'RESTORATION' })
    const res = await listGet(req(), { params })
    expect(res.status).toBe(400)
  })

  it('returns 403 UPGRADE_REQUIRED for a free-tier owner', async () => {
    mockUserFindUnique.mockResolvedValue({ isPro: false })
    const res = await listGet(req(), { params })
    expect(res.status).toBe(403)
  })

  it('returns 404 for a non-owner', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...OFFROAD_VEHICLE, ownerId: 'someone-else' })
    const res = await listGet(req(), { params })
    expect(res.status).toBe(404)
  })

  it('serializes distanceKm to a number', async () => {
    mockRunFindMany.mockResolvedValue([{ id: 'r1', distanceKm: { toNumber: () => 12.5 }, waypoints: [] }])
    const res = await listGet(req(), { params })
    const data = await res.json()
    expect(data[0].distanceKm).toBe(12.5)
  })
})

describe('POST /api/vehicles/[id]/trail-runs', () => {
  it('returns 400 when name is missing', async () => {
    const res = await listPost(req({ date: '2026-01-01' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for an invalid date', async () => {
    const res = await listPost(req({ name: 'Run', date: 'not-a-date' }), { params })
    expect(res.status).toBe(400)
  })

  it('creates a run with nested waypoints', async () => {
    mockRunCreate.mockResolvedValue({ id: 'r1', distanceKm: { toNumber: () => 5 }, waypoints: [] })
    const res = await listPost(
      req({
        name: 'Sunday trail',
        date: '2026-01-01T10:00:00.000Z',
        distanceKm: 5,
        durationMin: 40,
        elevationGainM: 120,
        trackGeoJson: [{ lat: 45, lng: 25, timestamp: 0 }],
        waypoints: [{ lat: 45.01, lng: 25.01, note: 'Muddy spot', recordedAt: '2026-01-01T10:10:00.000Z' }],
      }),
      { params }
    )
    expect(res.status).toBe(201)
    expect(mockRunCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Sunday trail',
          waypoints: { create: [expect.objectContaining({ lat: 45.01, lng: 25.01, note: 'Muddy spot' })] },
        }),
      })
    )
  })
})

describe('GET /api/vehicles/[id]/trail-runs/[runId]', () => {
  it('returns 404 for a run belonging to a different vehicle', async () => {
    mockRunFindUnique.mockResolvedValue({ id: 'r1', vehicleId: 'other-vehicle', waypoints: [] })
    const res = await detailGet(req(), { params: { id: 'v1', runId: 'r1' } })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/vehicles/[id]/trail-runs/[runId]', () => {
  it('deletes the run and its waypoint photos', async () => {
    mockRunFindUnique.mockResolvedValue({
      id: 'r1', vehicleId: 'v1',
      waypoints: [{ photoUrl: 'owner/v1/a.jpg' }, { photoUrl: null }],
    })
    const res = await detailDelete(req(), { params: { id: 'v1', runId: 'r1' } })
    expect(res.status).toBe(200)
    expect(mockRunDelete).toHaveBeenCalledWith({ where: { id: 'r1' } })
  })
})
