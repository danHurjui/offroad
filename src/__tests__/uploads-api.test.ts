jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: { vehicle: { findUnique: jest.fn() } },
}))
jest.mock('@/lib/access', () => ({ requireVehicleAccess: jest.fn() }))
jest.mock('@/lib/storage', () => ({
  ...jest.requireActual('@/lib/storage'),
  readUpload: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { requireVehicleAccess } from '@/lib/access'
import { readUpload } from '@/lib/storage'
import { GET } from '@/app/api/uploads/[...path]/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockRequireVehicleAccess = requireVehicleAccess as jest.Mock
const mockReadUpload = readUpload as jest.Mock

function req() {
  return {} as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockReadUpload.mockResolvedValue({ buffer: Buffer.from('data'), contentType: 'image/jpeg' })
})

describe('GET /api/uploads/[...path]', () => {
  it('returns 404 when the path has no vehicle segment', async () => {
    const res = await GET(req(), { params: { path: ['u1'] } })
    expect(res.status).toBe(404)
  })

  it('returns 404 when the vehicle does not exist', async () => {
    mockVehicleFindUnique.mockResolvedValue(null)
    const res = await GET(req(), { params: { path: ['u1', 'v1', 'photo.jpg'] } })
    expect(res.status).toBe(404)
  })

  it('returns 401 for a private vehicle with no session', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', isPublic: false })
    mockGetSession.mockResolvedValue(null)
    const res = await GET(req(), { params: { path: ['u1', 'v1', 'photo.jpg'] } })
    expect(res.status).toBe(401)
    expect(mockReadUpload).not.toHaveBeenCalled()
  })

  it('returns 404 for a private vehicle when the session user has no access', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', isPublic: false })
    mockGetSession.mockResolvedValue({ user: { id: 'stranger' } })
    mockRequireVehicleAccess.mockResolvedValue(null)
    const res = await GET(req(), { params: { path: ['u1', 'v1', 'photo.jpg'] } })
    expect(res.status).toBe(404)
  })

  it('serves the file for a private vehicle the session user can access', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', isPublic: false })
    mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
    mockRequireVehicleAccess.mockResolvedValue({ id: 'v1' })
    const res = await GET(req(), { params: { path: ['u1', 'v1', 'photo.jpg'] } })
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('private')
  })

  it('serves the file with no session at all when the vehicle is public', async () => {
    mockVehicleFindUnique.mockResolvedValue({ id: 'v1', isPublic: true })
    mockGetSession.mockResolvedValue(null)
    const res = await GET(req(), { params: { path: ['u1', 'v1', 'photo.jpg'] } })
    expect(res.status).toBe(200)
    expect(mockRequireVehicleAccess).not.toHaveBeenCalled()
    expect(res.headers.get('Cache-Control')).toContain('public')
  })
})
