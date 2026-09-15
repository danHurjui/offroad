jest.mock('@/lib/prisma', () => ({
  prisma: { vehicle: { findFirst: jest.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { generateVehicleSlug } from '@/lib/vehicleSlug'

const mockFindFirst = prisma.vehicle.findFirst as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('generateVehicleSlug', () => {
  it('builds a slug from year/make/model', async () => {
    mockFindFirst.mockResolvedValue(null)
    const slug = await generateVehicleSlug('u1', 2001, 'Jeep', 'Wrangler TJ')
    expect(slug).toBe('2001-jeep-wrangler-tj')
  })

  it('scopes the collision check to the given owner', async () => {
    mockFindFirst.mockResolvedValue(null)
    await generateVehicleSlug('u1', 2001, 'Jeep', 'TJ')
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { ownerId: 'u1', slug: '2001-jeep-tj' },
      select: { id: true },
    })
  })

  it('appends a suffix when the owner already has that slug', async () => {
    mockFindFirst.mockResolvedValueOnce({ id: 'existing' }).mockResolvedValueOnce(null)
    const slug = await generateVehicleSlug('u1', 2001, 'Jeep', 'TJ')
    expect(slug).toBe('2001-jeep-tj-2')
  })
})
