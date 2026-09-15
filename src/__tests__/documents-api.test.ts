jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    document: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  },
}))
jest.mock('@/lib/storage', () => ({
  ...jest.requireActual('@/lib/storage'),
  deleteUpload: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { deleteUpload } from '@/lib/storage'
import { GET as listGet, POST as listPost } from '@/app/api/vehicles/[id]/documents/route'
import { PATCH as docPatch, DELETE as docDelete } from '@/app/api/vehicles/[id]/documents/[docId]/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockDocFindUnique = prisma.document.findUnique as jest.Mock
const mockDocCreate = prisma.document.create as jest.Mock
const mockDocUpdate = prisma.document.update as jest.Mock
const mockDocDelete = prisma.document.delete as jest.Mock
const mockDeleteUpload = deleteUpload as jest.Mock

const VEHICLE = { id: 'v1', ownerId: 'u1', projectType: 'OFFROAD' }
const params = { id: 'v1' }

function req(body?: unknown) {
  return { json: () => Promise.resolve(body ?? {}) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
})

describe('POST /api/vehicles/[id]/documents', () => {
  it('returns 400 for an invalid document type', async () => {
    const res = await listPost(req({ type: 'MOT', expiryDate: '2026-01-01' }), { params })
    expect(res.status).toBe(400)
    expect(mockDocCreate).not.toHaveBeenCalled()
  })

  it('returns 400 for a missing expiryDate', async () => {
    const res = await listPost(req({ type: 'ITP' }), { params })
    expect(res.status).toBe(400)
  })

  it('creates a document', async () => {
    mockDocCreate.mockResolvedValue({ id: 'd1', type: 'ITP', expiryDate: new Date('2026-06-01') })
    const res = await listPost(req({ type: 'ITP', expiryDate: '2026-06-01' }), { params })
    expect(res.status).toBe(201)
    expect(mockDocCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ vehicleId: 'v1', type: 'ITP' }) })
    )
  })
})

describe('GET /api/vehicles/[id]/documents', () => {
  it('returns 404 when the vehicle is not accessible', async () => {
    mockVehicleFindUnique.mockResolvedValue(null)
    const res = await listGet(req(), { params })
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/vehicles/[id]/documents/[docId]', () => {
  const docParams = { id: 'v1', docId: 'd1' }

  it('resets all three reminder-sent fields when expiryDate changes', async () => {
    mockDocFindUnique.mockResolvedValue({ id: 'd1', vehicleId: 'v1', expiryDate: new Date('2026-01-01') })
    mockDocUpdate.mockResolvedValue({ id: 'd1' })
    await docPatch(req({ expiryDate: '2027-01-01' }), { params: docParams })
    expect(mockDocUpdate).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: {
        expiryDate: new Date('2027-01-01'),
        reminder30SentAt: null,
        reminder14SentAt: null,
        reminder3SentAt: null,
      },
    })
  })

  it('leaves reminder fields untouched when expiryDate is not part of the patch', async () => {
    mockDocFindUnique.mockResolvedValue({ id: 'd1', vehicleId: 'v1', expiryDate: new Date('2026-01-01') })
    mockDocUpdate.mockResolvedValue({ id: 'd1' })
    await docPatch(req({}), { params: docParams })
    expect(mockDocUpdate).toHaveBeenCalledWith({ where: { id: 'd1' }, data: {} })
  })

  it('returns 400 for an invalid expiryDate', async () => {
    mockDocFindUnique.mockResolvedValue({ id: 'd1', vehicleId: 'v1' })
    const res = await docPatch(req({ expiryDate: 'not-a-date' }), { params: docParams })
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/vehicles/[id]/documents/[docId]', () => {
  it('deletes the row and its attached file', async () => {
    mockDocFindUnique.mockResolvedValue({ id: 'd1', vehicleId: 'v1', fileUrl: 'u1/v1/scan.jpg' })
    const res = await docDelete(req(), { params: { id: 'v1', docId: 'd1' } })
    expect(res.status).toBe(200)
    expect(mockDocDelete).toHaveBeenCalledWith({ where: { id: 'd1' } })
    expect(mockDeleteUpload).toHaveBeenCalledWith('u1/v1/scan.jpg')
  })

  it('skips deleteUpload when there is no attached file', async () => {
    mockDocFindUnique.mockResolvedValue({ id: 'd1', vehicleId: 'v1', fileUrl: null })
    await docDelete(req(), { params: { id: 'v1', docId: 'd1' } })
    expect(mockDeleteUpload).not.toHaveBeenCalled()
  })
})
