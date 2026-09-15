jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    task: { findUnique: jest.fn() },
    taskPhoto: { findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/storage', () => ({
  ...jest.requireActual('@/lib/storage'),
  saveUpload: jest.fn(),
}))
jest.mock('@/lib/followNotify', () => ({ notifyFollowers: jest.fn().mockResolvedValue(undefined) }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { saveUpload } from '@/lib/storage'
import { notifyFollowers } from '@/lib/followNotify'
import { POST } from '@/app/api/vehicles/[id]/tasks/[taskId]/photos/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockTaskFindUnique = prisma.task.findUnique as jest.Mock
const mockPhotoCount = prisma.taskPhoto.count as jest.Mock
const mockPhotoCreate = prisma.taskPhoto.create as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockSaveUpload = saveUpload as jest.Mock
const mockNotifyFollowers = notifyFollowers as jest.Mock

const VEHICLE = { id: 'v1', ownerId: 'owner', projectType: 'OFFROAD' }
const params = { id: 'v1', taskId: 't1' }

function fileReq(file: File | null, photoType = 'BEFORE') {
  return {
    formData: () =>
      Promise.resolve({
        get: (key: string) => (key === 'file' ? file : key === 'photoType' ? photoType : null),
      }),
  } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
  mockTaskFindUnique.mockResolvedValue({ id: 't1', vehicleId: 'v1', name: 'Lift kit' })
  mockUserFindUnique.mockResolvedValue({ isPro: true })
  mockPhotoCount.mockResolvedValue(0)
  mockSaveUpload.mockResolvedValue('owner/v1/photo.jpg')
  mockPhotoCreate.mockResolvedValue({ id: 'p1', url: 'owner/v1/photo.jpg' })
})

describe('POST /api/vehicles/[id]/tasks/[taskId]/photos — follow notifications', () => {
  it('notifies followers when a photo is added', async () => {
    const res = await POST(fileReq(new File(['x'], 'p.jpg', { type: 'image/jpeg' })), { params })
    expect(res.status).toBe(201)
    expect(mockNotifyFollowers).toHaveBeenCalledWith('v1', 'added new photos to "Lift kit"')
  })

  it('does not notify when the upload is rejected', async () => {
    const res = await POST(fileReq(null), { params })
    expect(res.status).toBe(400)
    expect(mockNotifyFollowers).not.toHaveBeenCalled()
  })
})
