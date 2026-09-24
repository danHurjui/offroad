// The route handler is invoked directly here (no Next request scope), so
// `cookies()` would throw. The locale is the one thing it reads from the
// request; everything else about the PDF is exercised for real.
jest.mock('@/i18n/requestLocale', () => ({ localeFromRequest: () => 'en' }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    task: { findMany: jest.fn() },
  },
}))
jest.mock('@/lib/pdf', () => ({
  ...jest.requireActual('@/lib/pdf'),
  renderPdf: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { renderPdf } from '@/lib/pdf'
import { GET } from '@/app/api/vehicles/[id]/export/job-report/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockCollabFindFirst = prisma.projectCollaborator.findFirst as jest.Mock
const mockTaskFindMany = prisma.task.findMany as jest.Mock
const mockRenderPdf = renderPdf as jest.Mock

const VEHICLE = { id: 'v1', ownerId: 'owner', projectType: 'OFFROAD', make: 'Jeep', model: 'Wrangler', year: 2001 }
const params = { id: 'v1' }

function reqWithQuery(query: string) {
  return { url: `http://localhost/api/vehicles/v1/export/job-report${query}` } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
  mockCollabFindFirst.mockResolvedValue({ id: 'c1', email: 'mech@x.com', label: "Bob's Garage", collaboratorUser: { displayName: 'Bob' } })
  mockTaskFindMany.mockResolvedValue([])
  mockRenderPdf.mockResolvedValue(Buffer.from('%PDF-fake'))
})

describe('GET /api/vehicles/[id]/export/job-report — as a collaborator', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: { id: 'collaborator' } })
  })

  it('returns 404 for a user with no vehicle access at all', async () => {
    mockVehicleFindUnique.mockResolvedValue(null)
    const res = await GET(reqWithQuery(''), { params })
    expect(res.status).toBe(404)
  })

  it("always scopes the report to the requester's own tasks, ignoring a collaboratorId override", async () => {
    const res = await GET(reqWithQuery('?collaboratorId=someone-else'), { params })
    expect(res.status).toBe(200)
    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ addedByUserId: 'collaborator' }) })
    )
  })

  it('is never gated behind Pro — no isPro check at all', async () => {
    const res = await GET(reqWithQuery(''), { params })
    expect(res.status).toBe(200)
  })
})

describe('GET /api/vehicles/[id]/export/job-report — as the owner', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  })

  it('requires a collaboratorId query param', async () => {
    const res = await GET(reqWithQuery(''), { params })
    expect(res.status).toBe(400)
  })

  it('returns 404 when the given collaboratorId never collaborated on this vehicle', async () => {
    mockCollabFindFirst.mockResolvedValue(null)
    const res = await GET(reqWithQuery('?collaboratorId=stranger'), { params })
    expect(res.status).toBe(404)
  })

  it('scopes the report to the requested collaborator', async () => {
    const res = await GET(reqWithQuery('?collaboratorId=mech1'), { params })
    expect(res.status).toBe(200)
    expect(mockTaskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ addedByUserId: 'mech1' }) })
    )
  })
})

describe('date range handling', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: { id: 'collaborator' } })
  })

  it('defaults to a 30-day cutoff', async () => {
    await GET(reqWithQuery(''), { params })
    const call = mockTaskFindMany.mock.calls[0][0]
    expect(call.where.date).toBeDefined()
  })

  it('applies no date filter for range=all', async () => {
    await GET(reqWithQuery('?range=all'), { params })
    const call = mockTaskFindMany.mock.calls[0][0]
    expect(call.where.date).toBeUndefined()
  })
})

describe('DIY vs workshop cost split', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: { id: 'collaborator' } })
  })

  it('books a DIY-logged task fully as labour', async () => {
    mockTaskFindMany.mockResolvedValue([
      {
        id: 't1', name: 'Quick fix', category: 'ENGINE', date: new Date('2024-05-01'),
        workType: 'DIY', costRon: 150, partsCostRon: null, labourCostRon: null, photos: [],
      },
    ])
    const res = await GET(reqWithQuery(''), { params })
    expect(res.status).toBe(200)
    const docDefinition = mockRenderPdf.mock.calls[0][0]
    const content = JSON.stringify(docDefinition.content)
    expect(content).toContain('Total labour: 150,00 RON')
    expect(content).toContain('Total parts: 0,00 RON')
  })

  it('splits a workshop task into parts and labour', async () => {
    mockTaskFindMany.mockResolvedValue([
      {
        id: 't2', name: 'Diff service', category: 'ENGINE', date: new Date('2024-05-01'),
        workType: 'WORKSHOP', costRon: null, partsCostRon: 200, labourCostRon: 300, photos: [],
      },
    ])
    await GET(reqWithQuery(''), { params })
    const docDefinition = mockRenderPdf.mock.calls[0][0]
    const content = JSON.stringify(docDefinition.content)
    expect(content).toContain('Total labour: 300,00 RON')
    expect(content).toContain('Total parts: 200,00 RON')
  })
})
