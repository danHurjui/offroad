jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { requireVehicleAccess, requireVehicleOwner } from '@/lib/access'

const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockCollaboratorFindFirst = prisma.projectCollaborator.findFirst as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('requireVehicleAccess', () => {
  it('returns null when vehicle does not exist', async () => {
    mockVehicleFindUnique.mockResolvedValue(null)
    const result = await requireVehicleAccess('v1', 'u1')
    expect(result).toBeNull()
  })

  it('returns the vehicle when the user owns it', async () => {
    const vehicle = { id: 'v1', ownerId: 'u1' }
    mockVehicleFindUnique.mockResolvedValue(vehicle)
    const result = await requireVehicleAccess('v1', 'u1')
    expect(result).toBe(vehicle)
    expect(mockCollaboratorFindFirst).not.toHaveBeenCalled()
  })

  it('returns the vehicle when the user is an ACTIVE collaborator', async () => {
    const vehicle = { id: 'v1', ownerId: 'owner' }
    mockVehicleFindUnique.mockResolvedValue(vehicle)
    mockCollaboratorFindFirst.mockResolvedValue({ id: 'c1' })
    const result = await requireVehicleAccess('v1', 'collaborator')
    expect(result).toBe(vehicle)
    expect(mockCollaboratorFindFirst).toHaveBeenCalledWith({
      where: { vehicleId: 'v1', collaboratorUserId: 'collaborator', status: 'ACTIVE' },
    })
  })

  it('returns null when the user is neither owner nor an active collaborator', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', ownerId: 'owner' })
    mockCollaboratorFindFirst.mockResolvedValue(null)
    const result = await requireVehicleAccess('v1', 'stranger')
    expect(result).toBeNull()
  })
})

describe('requireVehicleOwner', () => {
  it('returns null when the user is a collaborator but not the owner', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', ownerId: 'owner' })
    const result = await requireVehicleOwner('v1', 'collaborator')
    expect(result).toBeNull()
  })

  it('returns the vehicle when the user is the owner', async () => {
    const vehicle = { id: 'v1', ownerId: 'owner' }
    mockVehicleFindUnique.mockResolvedValue(vehicle)
    const result = await requireVehicleOwner('v1', 'owner')
    expect(result).toBe(vehicle)
  })
})
