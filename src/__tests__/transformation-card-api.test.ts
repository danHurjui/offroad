jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    foundState: { findUnique: jest.fn() },
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
import { GET } from '@/app/api/vehicles/[id]/card/transformation/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockFoundStateFindUnique = prisma.foundState.findUnique as jest.Mock
const mockTaskFindMany = prisma.task.findMany as jest.Mock
const mockResolveImageDataUri = resolveImageDataUri as jest.Mock
const mockImageResponse = ImageResponse as unknown as jest.Mock

const VEHICLE = {
  id: 'v1', ownerId: 'owner', projectType: 'RESTORATION', make: 'Ford', model: 'Mustang', year: 1969,
  isPublic: false, slug: 'mustang', createdAt: new Date('2020-01-01'),
}
const params = { id: 'v1' }
function req(query = '') {
  return { url: `http://localhost/api/vehicles/v1/card/transformation${query}` } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
  mockUserFindUnique.mockResolvedValue({ isPro: true, username: 'owner-user' })
  mockFoundStateFindUnique.mockResolvedValue(null)
  mockTaskFindMany.mockResolvedValue([])
  mockResolveImageDataUri.mockResolvedValue(null)
})

describe('GET /api/vehicles/[id]/card/transformation', () => {
  it('returns 404 for a non-owner', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...VEHICLE, ownerId: 'someone-else' })
    const res = await GET(req(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 for an off-road vehicle', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...VEHICLE, projectType: 'OFFROAD' })
    const res = await GET(req(), { params })
    expect(res.status).toBe(400)
    expect(mockImageResponse).not.toHaveBeenCalled()
  })

  it('returns 403 UPGRADE_REQUIRED for a free-tier owner', async () => {
    mockUserFindUnique.mockResolvedValue({ isPro: false, username: 'owner-user' })
    const res = await GET(req(), { params })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('UPGRADE_REQUIRED')
  })

  it('renders successfully with no found state and no task photos (empty state)', async () => {
    const res = await GET(req(), { params })
    expect(res.status).toBe(200)
    expect(mockImageResponse).toHaveBeenCalledTimes(1)
  })

  it('defaults to the earliest found-state photo and the latest task photo', async () => {
    mockFoundStateFindUnique.mockResolvedValue({
      acquisitionDate: new Date('2021-03-15'),
      photos: [
        { id: 'fs1', url: 'owner/v1/found1.jpg', createdAt: new Date('2021-03-15') },
        { id: 'fs2', url: 'owner/v1/found2.jpg', createdAt: new Date('2021-04-01') },
      ],
    })
    mockTaskFindMany.mockResolvedValue([
      {
        status: 'IN_PROGRESS',
        originalityCondition: null,
        photos: [
          { id: 't1', url: 'owner/v1/old.jpg', createdAt: new Date('2022-01-01') },
          { id: 't2', url: 'owner/v1/new.jpg', createdAt: new Date('2023-06-01') },
        ],
      },
    ])
    await GET(req(), { params })
    expect(mockResolveImageDataUri).toHaveBeenCalledWith('owner/v1/found1.jpg')
    expect(mockResolveImageDataUri).toHaveBeenCalledWith('owner/v1/new.jpg')
  })

  it('uses the explicitly chosen before/after photo ids over the defaults', async () => {
    mockFoundStateFindUnique.mockResolvedValue({
      acquisitionDate: new Date('2021-03-15'),
      photos: [
        { id: 'fs1', url: 'owner/v1/found1.jpg', createdAt: new Date('2021-03-15') },
        { id: 'fs2', url: 'owner/v1/found2.jpg', createdAt: new Date('2021-04-01') },
      ],
    })
    mockTaskFindMany.mockResolvedValue([
      { status: 'IN_PROGRESS', originalityCondition: null, photos: [{ id: 't1', url: 'owner/v1/old.jpg', createdAt: new Date('2022-01-01') }] },
    ])
    await GET(req('?before=fs2&after=t1'), { params })
    expect(mockResolveImageDataUri).toHaveBeenCalledWith('owner/v1/found2.jpg')
    expect(mockResolveImageDataUri).toHaveBeenCalledWith('owner/v1/old.jpg')
  })
})
