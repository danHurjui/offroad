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
    projectCollaborator: { findFirst: jest.fn() },
    task: { findUnique: jest.fn() },
    taskPhoto: { findUnique: jest.fn(), delete: jest.fn() },
  },
}))
jest.mock('@/lib/storage', () => ({ ...jest.requireActual('@/lib/storage'), deleteUpload: jest.fn().mockResolvedValue(undefined) }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { DELETE } from '@/app/api/vehicles/[id]/tasks/[taskId]/photos/[photoId]/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockCollabFindFirst = prisma.projectCollaborator.findFirst as jest.Mock
const mockTaskFindUnique = prisma.task.findUnique as jest.Mock
const mockPhotoFindUnique = prisma.taskPhoto.findUnique as jest.Mock
const mockPhotoDelete = prisma.taskPhoto.delete as jest.Mock

const VEHICLE = { id: 'v1', ownerId: 'owner' }
const params = { id: 'v1', taskId: 't1', photoId: 'p1' }

function req() {
  return {} as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
  mockPhotoFindUnique.mockResolvedValue({ id: 'p1', taskId: 't1', vehicleId: 'v1', url: 'owner/v1/photo.jpg' })
})

describe('DELETE /api/vehicles/[id]/tasks/[taskId]/photos/[photoId]', () => {
  it('lets the owner delete any photo', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
    mockTaskFindUnique.mockResolvedValue({ id: 't1', addedByUserId: 'some-collaborator' })
    const res = await DELETE(req(), { params })
    expect(res.status).toBe(200)
    expect(mockPhotoDelete).toHaveBeenCalledWith({ where: { id: 'p1' } })
  })

  it('lets a collaborator delete a photo on a task they added', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'collab-1' } })
    mockCollabFindFirst.mockResolvedValue({ id: 'c1', vehicleId: 'v1', collaboratorUserId: 'collab-1', status: 'ACTIVE' })
    mockTaskFindUnique.mockResolvedValue({ id: 't1', addedByUserId: 'collab-1' })
    const res = await DELETE(req(), { params })
    expect(res.status).toBe(200)
  })

  it('blocks a collaborator from deleting a photo on a task added by someone else — CLAUDE.md pitfall #4', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'collab-1' } })
    mockCollabFindFirst.mockResolvedValue({ id: 'c1', vehicleId: 'v1', collaboratorUserId: 'collab-1', status: 'ACTIVE' })
    mockTaskFindUnique.mockResolvedValue({ id: 't1', addedByUserId: 'owner' })
    const res = await DELETE(req(), { params })
    expect(res.status).toBe(403)
    expect(mockPhotoDelete).not.toHaveBeenCalled()
  })

  it('returns 404 for a non-collaborator, non-owner', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'stranger' } })
    mockCollabFindFirst.mockResolvedValue(null)
    const res = await DELETE(req(), { params })
    expect(res.status).toBe(404)
    expect(mockPhotoDelete).not.toHaveBeenCalled()
  })
})
