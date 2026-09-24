jest.mock('@/i18n/requestLocale', () => ({ localeFromRequest: () => 'ro' }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    vehicle: { findMany: jest.fn() },
    vehicleAssignment: { findMany: jest.fn() },
    task: { findMany: jest.fn(), count: jest.fn() },
    document: { findMany: jest.fn() },
    organizationSite: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/ownershipRecords', () => ({ loadOwnershipInputs: jest.fn() }))
jest.mock('@/lib/rateLimit', () => {
  const actual = jest.requireActual('@/lib/rateLimit')
  return { ...actual, consumeRateLimit: jest.fn() }
})
jest.mock('@/lib/pdf', () => ({ ...jest.requireActual('@/lib/pdf'), renderPdf: jest.fn() }))

import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit } from '@/lib/rateLimit'
import { loadOwnershipInputs } from '@/lib/ownershipRecords'
import { renderPdf } from '@/lib/pdf'
import { GET as jobsGet } from '@/app/api/organizations/[orgId]/reports/jobs/route'
import { GET as costsGet } from '@/app/api/organizations/[orgId]/reports/costs/route'
import { GET as summaryGet } from '@/app/api/organizations/[orgId]/reports/summary/route'
import type { OwnershipInput } from '@/lib/ownershipCosts'

const mockMember = prisma.organizationMember.findUnique as jest.Mock
const mockVehicles = prisma.vehicle.findMany as jest.Mock
const mockAssignments = prisma.vehicleAssignment.findMany as jest.Mock
const mockTasks = prisma.task.findMany as jest.Mock
const mockConsume = consumeRateLimit as jest.Mock
const mockInputs = loadOwnershipInputs as jest.Mock
const mockRender = renderPdf as jest.Mock

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const ORG = { id: 'org1', name: 'Transport Șerban SRL' }
const VAN = { id: 'v1', organizationId: 'org1', year: 2019, make: 'Dacia', model: 'Dokker', plate: 'CJ 10 ABC', projectType: 'DAILY_DRIVER' }
const params = { params: { orgId: 'org1' } }
const req = (query: string, route = 'jobs') => new NextRequest(`http://localhost/api/organizations/org1/reports/${route}?${query}`)
const MARCH = 'from=2026-03-01&to=2026-03-31'

const ownership = (vehicleId: string): OwnershipInput => ({
  vehicleId,
  projectType: 'DAILY_DRIVER',
  now: d('2026-09-01'),
  vehicle: {
    createdAt: d('2025-01-01'),
    purchaseDate: null,
    purchasePriceRon: null,
    currentValueRon: null,
    currentValueAt: null,
    financeType: null,
    financeMonthlyRon: null,
    financeStartDate: null,
    financeEndDate: null,
    fuelType: null,
  },
  tasks: [],
  fuel: [{ id: 'f1', date: d('2026-03-12'), totalRon: 14999.5, station: 'OMV' }],
  charges: [],
  documents: [],
  tyreSets: [],
  expenses: [],
  readings: [],
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'u1' } })
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ active: true, isAdmin: false })
  mockMember.mockResolvedValue({ role: 'FLEET_MANAGER', organization: ORG })
  mockConsume.mockResolvedValue({ ok: true, remaining: 29, retryAfterSeconds: 0 })
  mockVehicles.mockResolvedValue([VAN])
  mockAssignments.mockResolvedValue([
    { vehicleId: 'v1', startedAt: new Date('2026-03-01T08:00:00Z'), endedAt: null, driver: { displayName: 'Ana Pop' } },
  ])
  mockTasks.mockResolvedValue([
    {
      id: 't1',
      vehicleId: 'v1',
      date: d('2026-03-05'),
      name: '=HYPERLINK("http://evil","click")',
      category: 'SERVICE',
      status: 'DONE',
      notes: 'Ulei; filtru',
      workType: 'WORKSHOP',
      workshopName: null,
      workshop: { name: 'Service Cluj' },
      costRon: null,
      partsCostRon: new Prisma.Decimal('1234.5'),
      labourCostRon: new Prisma.Decimal('300'),
      addedBy: null,
    },
  ])
  ;(prisma.task.count as jest.Mock).mockResolvedValue(1)
  ;(prisma.document.findMany as jest.Mock).mockResolvedValue([])
  mockInputs.mockImplementation(async (vehicles: Array<{ id: string }>) => new Map(vehicles.map((v) => [v.id, ownership(v.id)])))
  mockRender.mockResolvedValue(Buffer.from('%PDF-fake'))
})

describe.each([
  ['jobs', jobsGet],
  ['costs', costsGet],
  ['summary', summaryGet],
])('GET /reports/%s — who may, and what', (route, GET) => {
  it('is a 404 to someone outside the organisation', async () => {
    mockMember.mockResolvedValue(null)
    const res = await GET(req(MARCH, route), params)
    expect(res.status).toBe(404)
    expect(mockVehicles).not.toHaveBeenCalled()
  })

  it.each(['MECHANIC', 'DRIVER'])('is a 404 to a %s', async (role) => {
    mockMember.mockResolvedValue({ role, organization: ORG })
    expect((await GET(req(MARCH, route), params)).status).toBe(404)
    expect(mockVehicles).not.toHaveBeenCalled()
  })

  it('counts against the fleetReport limit per user id, and stops there', async () => {
    mockConsume.mockResolvedValue({ ok: false, remaining: 0, retryAfterSeconds: 60 })
    const res = await GET(req(MARCH, route), params)
    expect(res.status).toBe(429)
    expect(mockConsume).toHaveBeenCalledWith('fleetReport', 'user:u1')
    expect(mockVehicles).not.toHaveBeenCalled()
  })

  it('refuses a reversed or over-long period, whatever the form sent', async () => {
    expect((await GET(req('from=2026-03-31&to=2026-03-01', route), params)).status).toBe(400)
    const long = await GET(req('from=2024-01-01&to=2025-06-30', route), params)
    expect(long.status).toBe(400)
    expect((await long.json()).code).toBe('reportPeriodTooLong')
  })

  it('reads only this organisation’s vehicles', async () => {
    await GET(req(MARCH, route), params)
    expect(mockVehicles).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org1' } }))
  })

  // #103: a site narrows the report, and must be this organisation's.
  it('refuses a site that is not this organisation’s', async () => {
    ;(prisma.organizationSite.findUnique as jest.Mock).mockResolvedValue({ id: 's9', name: 'Their depot', organizationId: 'other' })
    const res = await GET(req(`${MARCH}&site=s9`, route), params)
    expect(res.status).toBe(404)
    expect(mockVehicles).not.toHaveBeenCalled()
  })

  it('narrows to the site’s vehicles', async () => {
    ;(prisma.organizationSite.findUnique as jest.Mock).mockResolvedValue({ id: 's1', name: 'Cluj', organizationId: 'org1' })
    expect((await GET(req(`${MARCH}&site=s1`, route), params)).status).toBe(200)
    expect(mockVehicles).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org1', siteId: 's1' } }))
  })

  it('refuses a vehicle that is not this organisation’s', async () => {
    const res = await GET(req(`${MARCH}&vehicle=someone-elses`, route), params)
    expect(res.status).toBe(404)
    expect(mockTasks).not.toHaveBeenCalled()
    expect(mockInputs).not.toHaveBeenCalled()
  })

  it('is a download nobody caches', async () => {
    const res = await GET(req(MARCH, route), params)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store, private')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="RigLog_[A-Za-z]+_Transport_Serban_SRL_2026-03-01_2026-03-31\.(csv|pdf)"$/)
  })
})

describe('the jobs CSV', () => {
  it('asks for the period’s jobs only', async () => {
    await jobsGet(req(MARCH), params)
    expect(mockTasks).toHaveBeenCalledWith(
      expect.objectContaining({ where: { vehicleId: { in: ['v1'] }, date: { gte: d('2026-03-01'), lt: d('2026-04-01') } } })
    )
  })

  it('writes Romanian amounts, defuses formulas and names who logged it and who drove', async () => {
    const res = await jobsGet(req(MARCH), params)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    const text = await res.text()
    const [header, row] = text.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(header).toBe(
      '"Data";"Vehicul";"Nr. înmatriculare";"Categorie";"Stare";"Descriere";"Note";"Service";"Piese (RON)";"Manoperă (RON)";"Total (RON)";"Înregistrat de";"Șofer în ziua respectivă"'
    )
    const fields = row.split('";"')
    expect(fields[0]).toBe('"05.03.2026')
    expect(fields[2]).toBe('CJ 10 ABC')
    expect(fields[5]).toBe(`'=HYPERLINK(""http://evil"",""click"")`)
    expect(fields[6]).toBe('Ulei; filtru')
    expect(fields[7]).toBe('Service Cluj')
    expect(fields.slice(8, 11)).toEqual(['1.234,50', '300,00', '1.534,50'])
    expect(fields[11]).toBe('cont șters')
    expect(fields[12]).toBe('Ana Pop"')
  })
})

describe('the cost CSV', () => {
  it('lists each cost with the driver that day, amounts the Romanian way', async () => {
    const text = await (await costsGet(req(MARCH, 'costs'), params)).text()
    const [, row] = text.replace(/^\uFEFF/, '').trim().split('\r\n')
    expect(row).toBe('"2019 Dacia Dokker";"CJ 10 ABC";"12.03.2026";"Combustibil și încărcare";"Alimentare";"OMV";"14.999,50";"Ana Pop"')
  })
})

describe('the summary PDF', () => {
  it('prints the period’s spend and names the drivers', async () => {
    const res = await summaryGet(req(MARCH, 'summary'), params)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    const doc = JSON.stringify(mockRender.mock.calls[0][0])
    expect(doc).toContain('Transport Șerban SRL')
    expect(doc).toContain('14.999,50 RON')
    expect(doc).toContain('Ana Pop')
    expect(doc).toContain('01.03.2026 – 31.03.2026')
  })
})

describe('every report route goes through the one gate', () => {
  it.each(['jobs', 'costs', 'summary'])('%s calls loadReport before anything else reads the database', (route) => {
    const source = fs.readFileSync(path.join(process.cwd(), `src/app/api/organizations/[orgId]/reports/${route}/route.ts`), 'utf8')
    const gate = source.indexOf('loadReport(')
    expect(gate).toBeGreaterThan(-1)
    const firstRead = source.search(/prisma\.|loadOwnershipInputs\(/)
    expect(firstRead === -1 || firstRead > gate).toBe(true)
  })
})
