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
    vehicle: { findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), findFirst: jest.fn() },
    task: { findMany: jest.fn() },
    foundState: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    user: { findUniqueOrThrow: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { PATCH } from '@/app/api/vehicles/[id]/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockVehicleUpdate = prisma.vehicle.update as jest.Mock
const mockVehicleFindFirst = prisma.vehicle.findFirst as jest.Mock
const mockUserFindUniqueOrThrow = prisma.user.findUniqueOrThrow as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserUpdate = prisma.user.update as jest.Mock

const VEHICLE = { id: 'v1', ownerId: 'owner', make: 'Jeep', model: 'Wrangler', year: 2001, slug: 'existing-slug' }
const params = { id: 'v1' }

function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
  mockVehicleUpdate.mockResolvedValue({ ...VEHICLE })
  mockUserFindUniqueOrThrow.mockResolvedValue({ username: 'owner-user', displayName: 'Owner' })
  mockUserFindUnique.mockResolvedValue(null) // no username collision by default
})

describe('PATCH /api/vehicles/[id]', () => {
  it('saves hidePublicCost', async () => {
    const res = await PATCH(req({ hidePublicCost: true }), { params })
    expect(res.status).toBe(200)
    expect(mockVehicleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ hidePublicCost: true }) })
    )
  })

  it('does not touch slug/username when isPublic is not being changed', async () => {
    await PATCH(req({ make: 'Toyota' }), { params })
    expect(mockUserFindUniqueOrThrow).not.toHaveBeenCalled()
    expect(mockVehicleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ slug: expect.anything() }) })
    )
  })

  it('ensures the owner has a username when the vehicle is made public', async () => {
    mockUserFindUniqueOrThrow.mockResolvedValue({ username: null, displayName: 'Owner Name' })
    await PATCH(req({ isPublic: true }), { params })
    expect(mockUserUpdate).toHaveBeenCalledWith({ where: { id: 'owner' }, data: { username: 'owner-name' } })
  })

  it('backfills a missing slug when switched to public', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...VEHICLE, slug: null })
    mockVehicleFindFirst.mockResolvedValue(null)
    await PATCH(req({ isPublic: true }), { params })
    expect(mockVehicleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: '2001-jeep-wrangler' }) })
    )
  })

  it('leaves an existing slug alone when re-publishing', async () => {
    await PATCH(req({ isPublic: true }), { params })
    expect(mockVehicleFindFirst).not.toHaveBeenCalled()
    expect(mockVehicleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ slug: expect.anything() }) })
    )
  })
})
