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
    task: { findUnique: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/storage', () => ({
  ...jest.requireActual('@/lib/storage'),
  saveUpload: jest.fn(),
  deleteUpload: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { saveUpload, deleteUpload } from '@/lib/storage'
import { POST, DELETE } from '@/app/api/vehicles/[id]/tasks/[taskId]/receipt/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockTaskFindUnique = prisma.task.findUnique as jest.Mock
const mockTaskUpdate = prisma.task.update as jest.Mock
const mockSaveUpload = saveUpload as jest.Mock
const mockDeleteUpload = deleteUpload as jest.Mock

const VEHICLE = { id: 'v1', ownerId: 'owner', projectType: 'OFFROAD' }
const params = { id: 'v1', taskId: 't1' }

function fileReq(file: File | null) {
  return { formData: () => Promise.resolve({ get: () => file }) } as never
}
function emptyReq() {
  return {} as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
})

describe('POST /api/vehicles/[id]/tasks/[taskId]/receipt', () => {
  it('returns 403 when a collaborator tries to attach a receipt to a task they did not add', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'collaborator' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    mockTaskFindUnique.mockResolvedValue({ id: 't1', vehicleId: 'v1', addedByUserId: 'owner', receiptUrl: null })
    const res = await POST(fileReq(new File(['x'], 'r.jpg', { type: 'image/jpeg' })), { params })
    expect(res.status).toBe(403)
    expect(mockSaveUpload).not.toHaveBeenCalled()
  })

  it('allows a collaborator to attach a receipt to their own task', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'collaborator' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    mockTaskFindUnique.mockResolvedValue({ id: 't1', vehicleId: 'v1', addedByUserId: 'collaborator', receiptUrl: null })
    mockSaveUpload.mockResolvedValue('owner/v1/receipt.jpg')
    mockTaskUpdate.mockResolvedValue({ id: 't1', receiptUrl: 'owner/v1/receipt.jpg' })
    const res = await POST(fileReq(new File(['x'], 'r.jpg', { type: 'image/jpeg' })), { params })
    expect(res.status).toBe(200)
  })

  it('returns 400 when no file is provided', async () => {
    const res = await POST(fileReq(null), { params })
    expect(res.status).toBe(400)
  })

  it('replaces an existing receipt: saves the new one and deletes the old', async () => {
    mockTaskFindUnique.mockResolvedValue({ id: 't1', vehicleId: 'v1', addedByUserId: 'owner', receiptUrl: 'old/path.jpg' })
    mockSaveUpload.mockResolvedValue('owner/v1/new.jpg')
    mockTaskUpdate.mockResolvedValue({ id: 't1', receiptUrl: 'owner/v1/new.jpg' })
    const res = await POST(fileReq(new File(['x'], 'r.jpg', { type: 'image/jpeg' })), { params })
    expect(res.status).toBe(200)
    expect(mockDeleteUpload).toHaveBeenCalledWith('old/path.jpg')
  })
})

describe('DELETE /api/vehicles/[id]/tasks/[taskId]/receipt', () => {
  it('returns 404 when there is no receipt to remove', async () => {
    mockTaskFindUnique.mockResolvedValue({ id: 't1', vehicleId: 'v1', addedByUserId: 'owner', receiptUrl: null })
    const res = await DELETE(emptyReq(), { params })
    expect(res.status).toBe(404)
  })

  it('clears receiptUrl and deletes the stored file', async () => {
    mockTaskFindUnique.mockResolvedValue({ id: 't1', vehicleId: 'v1', addedByUserId: 'owner', receiptUrl: 'owner/v1/r.jpg' })
    mockTaskUpdate.mockResolvedValue({ id: 't1', receiptUrl: null })
    const res = await DELETE(emptyReq(), { params })
    expect(res.status).toBe(200)
    expect(mockTaskUpdate).toHaveBeenCalledWith({ where: { id: 't1' }, data: { receiptUrl: null } })
    expect(mockDeleteUpload).toHaveBeenCalledWith('owner/v1/r.jpg')
  })
})
