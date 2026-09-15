jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn(), update: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    task: { findMany: jest.fn(), create: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET, POST } from '@/app/api/vehicles/[id]/tasks/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockVehicleUpdate = prisma.vehicle.update as jest.Mock
const mockTaskFindMany = prisma.task.findMany as jest.Mock
const mockTaskCreate = prisma.task.create as jest.Mock

const OFFROAD_VEHICLE = { id: 'v1', ownerId: 'u1', projectType: 'OFFROAD' }
const params = { id: 'v1' }

function makeGetReq(query = '') {
  return { url: `http://localhost/api/vehicles/v1/tasks${query}` } as never
}
function makePostReq(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
  mockVehicleFindUnique.mockResolvedValue(OFFROAD_VEHICLE)
})

describe('GET /api/vehicles/[id]/tasks', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await GET(makeGetReq(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 404 when the vehicle does not belong to the user', async () => {
    mockVehicleFindUnique.mockResolvedValue(null)
    const res = await GET(makeGetReq(), { params })
    expect(res.status).toBe(404)
  })

  it('serializes Decimal cost fields to numbers', async () => {
    mockTaskFindMany.mockResolvedValue([
      { id: 't1', workType: 'DIY', costRon: { toNumber: () => 150 }, partsCostRon: null, labourCostRon: null },
    ])
    const res = await GET(makeGetReq(), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data[0].costRon).toBe(150)
    expect(data[0].totalCostRon).toBe(150)
  })
})

describe('POST /api/vehicles/[id]/tasks', () => {
  it('returns 400 for a category that does not belong to the vehicle mode', async () => {
    const res = await POST(
      makePostReq({ name: 'Repaint', category: 'BODY_PANELS', status: 'DONE', date: '2025-01-01' }),
      { params }
    )
    expect(res.status).toBe(400)
    expect(mockTaskCreate).not.toHaveBeenCalled()
  })

  it('returns 400 when work type is Workshop but workshopName is missing', async () => {
    const res = await POST(
      makePostReq({ name: 'Lift kit', category: 'SUSPENSION', status: 'DONE', date: '2025-01-01', workType: 'WORKSHOP' }),
      { params }
    )
    expect(res.status).toBe(400)
  })

  it('creates a DIY task and touches the vehicle updatedAt', async () => {
    mockTaskCreate.mockResolvedValue({
      id: 't1', workType: 'DIY', costRon: { toNumber: () => 500 }, partsCostRon: null, labourCostRon: null,
    })
    const res = await POST(
      makePostReq({ name: 'Lift kit', category: 'SUSPENSION', status: 'DONE', date: '2025-01-01', costRon: 500 }),
      { params }
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.totalCostRon).toBe(500)
    expect(mockVehicleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'v1' } })
    )
  })

  it('creates a workshop task with the collaborator as addedByUserId', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', ownerId: 'owner', projectType: 'OFFROAD' })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    mockTaskCreate.mockResolvedValue({
      id: 't2', workType: 'WORKSHOP', costRon: null, partsCostRon: { toNumber: () => 100 }, labourCostRon: { toNumber: () => 200 },
    })
    const res = await POST(
      makePostReq({
        name: 'Diff service', category: 'ENGINE', status: 'DONE', date: '2025-01-01',
        workType: 'WORKSHOP', workshopName: 'Bob\'s Garage', partsCostRon: 100, labourCostRon: 200,
      }),
      { params }
    )
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.totalCostRon).toBe(300)
    expect(mockTaskCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ addedByUserId: 'u1' }) })
    )
  })
})
