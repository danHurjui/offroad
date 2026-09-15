jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    task: { findMany: jest.fn() },
    foundState: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/pdf', () => ({
  ...jest.requireActual('@/lib/pdf'),
  renderPdf: jest.fn(),
  resolveImageDataUri: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { renderPdf, resolveImageDataUri } from '@/lib/pdf'
import { GET } from '@/app/api/vehicles/[id]/export/pdf/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockTaskFindMany = prisma.task.findMany as jest.Mock
const mockFoundStateFindUnique = prisma.foundState.findUnique as jest.Mock
const mockRenderPdf = renderPdf as jest.Mock
const mockResolveImageDataUri = resolveImageDataUri as jest.Mock

const VEHICLE = {
  id: 'v1',
  ownerId: 'owner',
  projectType: 'OFFROAD',
  make: 'Jeep',
  model: 'Wrangler',
  year: 2001,
  generation: 'TJ',
  engine: null,
  vin: null,
  coverPhotoUrl: null,
}
const params = { id: 'v1' }
function req() {
  return {} as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
  mockUserFindUnique.mockResolvedValue({ isPro: true })
  mockTaskFindMany.mockResolvedValue([])
  mockFoundStateFindUnique.mockResolvedValue(null)
  mockResolveImageDataUri.mockResolvedValue(null)
  mockRenderPdf.mockResolvedValue(Buffer.from('%PDF-fake'))
})

describe('GET /api/vehicles/[id]/export/pdf', () => {
  it('returns 404 for a non-owner', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...VEHICLE, ownerId: 'someone-else' })
    const res = await GET(req(), { params })
    expect(res.status).toBe(404)
  })

  it('returns 403 UPGRADE_REQUIRED for a free-tier owner', async () => {
    mockUserFindUnique.mockResolvedValue({ isPro: false })
    const res = await GET(req(), { params })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('UPGRADE_REQUIRED')
    expect(mockRenderPdf).not.toHaveBeenCalled()
  })

  it('returns a PDF with the right headers for a Pro owner', async () => {
    const res = await GET(req(), { params })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('RigLog_2001_Jeep_Wrangler_')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.toString()).toBe('%PDF-fake')
  })

  it('groups tasks by category and passes them to the doc builder', async () => {
    mockTaskFindMany.mockResolvedValue([
      { id: 't1', name: 'Lift kit', brand: null, category: 'SUSPENSION', status: 'DONE', workType: 'DIY', costRon: 500, partsCostRon: null, labourCostRon: null, date: new Date('2024-01-01'), notes: null, workshopName: null, photos: [] },
      { id: 't2', name: 'Rock sliders', brand: null, category: 'PROTECTION', status: 'PLANNED', workType: 'DIY', costRon: 800, partsCostRon: null, labourCostRon: null, date: new Date('2024-02-01'), notes: null, workshopName: null, photos: [] },
    ])
    const res = await GET(req(), { params })
    expect(res.status).toBe(200)
    const docDefinition = mockRenderPdf.mock.calls[0][0]
    const content = JSON.stringify(docDefinition.content)
    expect(content).toContain('Suspension')
    expect(content).toContain('Protection')
    expect(content).toContain('Lift kit')
    expect(content).toContain('Rock sliders')
  })

  it('returns 500 when rendering fails', async () => {
    mockRenderPdf.mockRejectedValue(new Error('boom'))
    const res = await GET(req(), { params })
    expect(res.status).toBe(500)
  })
})
