jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn(), update: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    wishlistItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    task: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET as listGet, POST as listPost } from '@/app/api/vehicles/[id]/wishlist/route'
import { PATCH as itemPatch, DELETE as itemDelete } from '@/app/api/vehicles/[id]/wishlist/[itemId]/route'
import { POST as reorderPost } from '@/app/api/vehicles/[id]/wishlist/reorder/route'
import { POST as convertPost } from '@/app/api/vehicles/[id]/wishlist/[itemId]/convert/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockItemFindMany = prisma.wishlistItem.findMany as jest.Mock
const mockItemFindUnique = prisma.wishlistItem.findUnique as jest.Mock
const mockItemCreate = prisma.wishlistItem.create as jest.Mock
const mockItemUpdate = prisma.wishlistItem.update as jest.Mock
const mockItemDelete = prisma.wishlistItem.delete as jest.Mock
const mockAggregate = prisma.wishlistItem.aggregate as jest.Mock
const mockTransaction = prisma.$transaction as jest.Mock

const OFFROAD_VEHICLE = { id: 'v1', ownerId: 'u1', projectType: 'OFFROAD' }
const params = { id: 'v1' }

function req(body?: unknown) {
  return { json: () => Promise.resolve(body ?? {}) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
  mockVehicleFindUnique.mockResolvedValue(OFFROAD_VEHICLE)
})

describe('GET /api/vehicles/[id]/wishlist', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await listGet(req(), { params })
    expect(res.status).toBe(401)
  })

  it('serializes estimatedCostRon to a number', async () => {
    mockItemFindMany.mockResolvedValue([{ id: 'w1', estimatedCostRon: { toNumber: () => 250 } }])
    const res = await listGet(req(), { params })
    const data = await res.json()
    expect(data[0].estimatedCostRon).toBe(250)
  })
})

describe('POST /api/vehicles/[id]/wishlist', () => {
  it('returns 400 when name is missing', async () => {
    const res = await listPost(req({ category: 'SUSPENSION' }), { params })
    expect(res.status).toBe(400)
  })

  it('returns 400 for a status outside the vehicle mode vocabulary', async () => {
    const res = await listPost(req({ name: 'Lift kit', status: 'STRIPPED' }), { params })
    expect(res.status).toBe(400)
  })

  it('creates an item at the next priority slot', async () => {
    mockAggregate.mockResolvedValue({ _max: { priority: 4 } })
    mockItemCreate.mockResolvedValue({ id: 'w1', estimatedCostRon: null })
    const res = await listPost(req({ name: 'Rock sliders', estimatedCostRon: 1200 }), { params })
    expect(res.status).toBe(201)
    expect(mockItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ priority: 5, status: 'RESEARCHING' }) })
    )
  })

  it('never stores partCondition for an off-road vehicle', async () => {
    mockAggregate.mockResolvedValue({ _max: { priority: null } })
    mockItemCreate.mockResolvedValue({ id: 'w1', estimatedCostRon: null })
    await listPost(req({ name: 'Winch', partCondition: 'NOS' }), { params })
    expect(mockItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ partCondition: null, priority: 0 }) })
    )
  })
})

describe('PATCH /api/vehicles/[id]/wishlist/[itemId]', () => {
  const itemParams = { id: 'v1', itemId: 'w1' }

  it('returns 404 for an item belonging to a different vehicle', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'w1', vehicleId: 'other-vehicle' })
    const res = await itemPatch(req({ name: 'x' }), { params: itemParams })
    expect(res.status).toBe(404)
  })

  it('rejects an invalid status', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'w1', vehicleId: 'v1' })
    const res = await itemPatch(req({ status: 'NOT_A_STATUS' }), { params: itemParams })
    expect(res.status).toBe(400)
  })

  it('updates fields and serializes the result', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'w1', vehicleId: 'v1' })
    mockItemUpdate.mockResolvedValue({ id: 'w1', estimatedCostRon: { toNumber: () => 500 } })
    const res = await itemPatch(req({ estimatedCostRon: 500 }), { params: itemParams })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.estimatedCostRon).toBe(500)
  })
})

describe('DELETE /api/vehicles/[id]/wishlist/[itemId]', () => {
  it('deletes an owned item', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'w1', vehicleId: 'v1' })
    const res = await itemDelete(req(), { params: { id: 'v1', itemId: 'w1' } })
    expect(res.status).toBe(200)
    expect(mockItemDelete).toHaveBeenCalledWith({ where: { id: 'w1' } })
  })
})

describe('POST /api/vehicles/[id]/wishlist/reorder', () => {
  it('rejects a partial list that does not match the full wishlist', async () => {
    ;(prisma.wishlistItem.findMany as jest.Mock).mockResolvedValue([{ id: 'w1' }, { id: 'w2' }])
    const res = await reorderPost(req({ orderedIds: ['w1'] }), { params })
    expect(res.status).toBe(400)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects an id that does not belong to this vehicle', async () => {
    ;(prisma.wishlistItem.findMany as jest.Mock).mockResolvedValue([{ id: 'w1' }, { id: 'w2' }])
    const res = await reorderPost(req({ orderedIds: ['w1', 'foreign-id'] }), { params })
    expect(res.status).toBe(400)
  })

  it('reorders and sets priority to array index', async () => {
    ;(prisma.wishlistItem.findMany as jest.Mock).mockResolvedValue([{ id: 'w1' }, { id: 'w2' }])
    mockTransaction.mockResolvedValue([{}, {}])
    const res = await reorderPost(req({ orderedIds: ['w2', 'w1'] }), { params })
    expect(res.status).toBe(200)
    expect(mockTransaction).toHaveBeenCalledWith([
      expect.objectContaining({}),
      expect.objectContaining({}),
    ])
  })
})

describe('POST /api/vehicles/[id]/wishlist/[itemId]/convert', () => {
  const convertParams = { id: 'v1', itemId: 'w1' }

  it('returns 400 when the item has no category and none is supplied', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'w1', vehicleId: 'v1', category: null })
    const res = await convertPost(req({}), { params: convertParams })
    expect(res.status).toBe(400)
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('rejects a category outside the vehicle mode vocabulary', async () => {
    mockItemFindUnique.mockResolvedValue({ id: 'w1', vehicleId: 'v1', category: 'BODY_PANELS' })
    const res = await convertPost(req({}), { params: convertParams })
    expect(res.status).toBe(400)
  })

  it('creates a DONE task from the wishlist item and marks it INSTALLED', async () => {
    mockItemFindUnique.mockResolvedValue({
      id: 'w1', vehicleId: 'v1', category: 'SUSPENSION', name: 'Lift kit',
      estimatedCostRon: { toNumber: () => 3000 }, supplierUrl: null, notes: null,
    })
    mockTransaction.mockResolvedValue([
      { id: 't1', workType: 'DIY', costRon: { toNumber: () => 3000 }, partsCostRon: null, labourCostRon: null },
      {},
      {},
    ])
    const res = await convertPost(req({}), { params: convertParams })
    const data = await res.json()
    expect(res.status).toBe(201)
    expect(data.totalCostRon).toBe(3000)
  })
})
