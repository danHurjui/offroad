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
    trailRun: { findUnique: jest.fn() },
    trailWaypoint: { findUnique: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/storage', () => ({ ...jest.requireActual('@/lib/storage'), saveUpload: jest.fn() }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { saveUpload } from '@/lib/storage'
import { POST } from '@/app/api/vehicles/[id]/trail-runs/[runId]/waypoints/[waypointId]/photo/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockRunFindUnique = prisma.trailRun.findUnique as jest.Mock
const mockWaypointFindUnique = prisma.trailWaypoint.findUnique as jest.Mock
const mockWaypointUpdate = prisma.trailWaypoint.update as jest.Mock
const mockSaveUpload = saveUpload as jest.Mock

const VEHICLE = { id: 'v1', ownerId: 'owner', projectType: 'OFFROAD' }
const params = { id: 'v1', runId: 'r1', waypointId: 'w1' }

function fileReq(file: File | null) {
  return { formData: () => Promise.resolve({ get: (key: string) => (key === 'file' ? file : null) }) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
  mockRunFindUnique.mockResolvedValue({ id: 'r1', vehicleId: 'v1' })
  mockWaypointFindUnique.mockResolvedValue({ id: 'w1', trailRunId: 'r1' })
  mockSaveUpload.mockResolvedValue('owner/v1/waypoint.jpg')
  mockWaypointUpdate.mockResolvedValue({ id: 'w1', photoUrl: 'owner/v1/waypoint.jpg' })
})

describe('POST /api/vehicles/[id]/trail-runs/[runId]/waypoints/[waypointId]/photo', () => {
  it('returns 400 when no file is provided', async () => {
    const res = await POST(fileReq(null), { params })
    expect(res.status).toBe(400)
  })

  it('returns 404 for a waypoint belonging to a different run', async () => {
    mockWaypointFindUnique.mockResolvedValue({ id: 'w1', trailRunId: 'other-run' })
    const res = await POST(fileReq(new File(['x'], 'p.jpg', { type: 'image/jpeg' })), { params })
    expect(res.status).toBe(404)
  })

  it('saves the upload and updates the waypoint', async () => {
    const res = await POST(fileReq(new File(['x'], 'p.jpg', { type: 'image/jpeg' })), { params })
    expect(res.status).toBe(200)
    expect(mockSaveUpload).toHaveBeenCalledWith('owner', 'v1', 'p.jpg', expect.any(Buffer), 'image/jpeg')
    expect(mockWaypointUpdate).toHaveBeenCalledWith({ where: { id: 'w1' }, data: { photoUrl: 'owner/v1/waypoint.jpg' } })
  })
})
