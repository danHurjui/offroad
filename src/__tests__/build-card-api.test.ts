jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    task: { findMany: jest.fn() },
  },
}))
jest.mock('@/lib/pdf', () => ({
  ...jest.requireActual('@/lib/pdf'),
  resolveImageDataUri: jest.fn(),
}))
jest.mock('next/og', () => ({
  ImageResponse: jest.fn().mockImplementation(() => new Response('fake-png', { status: 200 })),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { resolveImageDataUri } from '@/lib/pdf'
import { ImageResponse } from 'next/og'
import { GET } from '@/app/api/vehicles/[id]/card/build/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockTaskFindMany = prisma.task.findMany as jest.Mock
const mockResolveImageDataUri = resolveImageDataUri as jest.Mock
const mockImageResponse = ImageResponse as unknown as jest.Mock

const VEHICLE = {
  id: 'v1', ownerId: 'owner', projectType: 'OFFROAD', make: 'Jeep', model: 'Wrangler', year: 2001,
  coverPhotoUrl: null, isPublic: false, slug: 'jeep-wrangler',
}
const params = { id: 'v1' }
function req() {
  return {} as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
  mockUserFindUnique.mockResolvedValue({ isPro: true, username: 'owner-user' })
  mockTaskFindMany.mockResolvedValue([])
  mockResolveImageDataUri.mockResolvedValue(null)
})

describe('GET /api/vehicles/[id]/card/build', () => {
  it('returns 404 for a non-owner', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...VEHICLE, ownerId: 'someone-else' })
    const res = await GET(req(), { params })
    expect(res.status).toBe(404)
    expect(mockImageResponse).not.toHaveBeenCalled()
  })

  it('returns 403 UPGRADE_REQUIRED for a free-tier owner', async () => {
    mockUserFindUnique.mockResolvedValue({ isPro: false, username: 'owner-user' })
    const res = await GET(req(), { params })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('UPGRADE_REQUIRED')
    expect(mockImageResponse).not.toHaveBeenCalled()
  })

  it('renders an ImageResponse for a Pro owner', async () => {
    const res = await GET(req(), { params })
    expect(res.status).toBe(200)
    expect(mockImageResponse).toHaveBeenCalledTimes(1)
  })

  it('resolves the cover photo to a data URI when present', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...VEHICLE, coverPhotoUrl: 'owner/v1/cover.jpg' })
    mockResolveImageDataUri.mockResolvedValue('data:image/jpeg;base64,AAA')
    await GET(req(), { params })
    expect(mockResolveImageDataUri).toHaveBeenCalledWith('owner/v1/cover.jpg')
  })
})
