jest.mock('@/i18n/requestLocale', () => ({ localeFromRequest: () => 'en' }))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    vehicle: { findMany: jest.fn() },
    odometerReading: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    trip: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  },
}))
jest.mock('@/lib/access', () => ({ ...jest.requireActual('@/lib/access'), requireVehicleAccess: jest.fn() }))
jest.mock('@/lib/rateLimit', () => ({ ...jest.requireActual('@/lib/rateLimit'), consumeRateLimit: jest.fn() }))

import fs from 'fs'
import path from 'path'
import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { requireVehicleAccess } from '@/lib/access'
import { consumeRateLimit } from '@/lib/rateLimit'
import { POST } from '@/app/api/vehicles/[id]/trips/route'
import { DELETE } from '@/app/api/vehicles/[id]/trips/[tripId]/route'
import { GET as exportVehicle } from '@/app/api/vehicles/[id]/trips/export/route'
import { GET as exportFleet } from '@/app/api/organizations/[orgId]/reports/trips/route'

const mockAccess = requireVehicleAccess as jest.Mock
const user = prisma.user.findUnique as jest.Mock
const member = prisma.organizationMember.findUnique as jest.Mock
const readings = prisma.odometerReading.findMany as jest.Mock
const readingCreate = prisma.odometerReading.create as jest.Mock
const tripCreate = prisma.trip.create as jest.Mock
const tripFind = prisma.trip.findUnique as jest.Mock
const tripFindMany = prisma.trip.findMany as jest.Mock

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const COMPANY_VAN = { id: 'v1', ownerId: 'boss', organizationId: 'org1', make: 'Dacia', model: 'Dokker', year: 2019, plate: 'CJ 10 ABC', access: 'owner' }
const PERSONAL_CAR = { ...COMPANY_VAN, ownerId: 'me', organizationId: null }
const params = { params: { id: 'v1' } }
const post = (body: object) =>
  new NextRequest('http://localhost/api/vehicles/v1/trips', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const BODY = { date: '2026-03-05', fromPlace: 'Cluj', toPlace: 'Turda', purpose: 'Client', kind: 'BUSINESS', startKm: '1000', endKm: '1042' }

beforeEach(() => {
  jest.clearAllMocks()
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'me' } })
  // requireSession's revalidation, the owner's plan and the driver's name all read the user.
  user.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id: where.id,
    active: true,
    isAdmin: false,
    isPro: false,
    isProComped: false,
    displayName: where.id === 'me' ? 'Ana Pop' : 'Bogdan Ionescu',
  }))
  mockAccess.mockResolvedValue(COMPANY_VAN)
  readings.mockResolvedValue([])
  readingCreate.mockImplementation(async ({ data }: { data: { km: number } }) => ({ id: `r${data.km}` }))
  tripCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...data,
    id: 't1',
    createdAt: new Date(),
    startReading: { km: 1000 },
    endReading: { km: 1042 },
  }))
  ;(prisma.$transaction as jest.Mock).mockImplementation(async (arg: unknown) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg as unknown[])))
  ;(consumeRateLimit as jest.Mock).mockResolvedValue({ ok: true, remaining: 29, retryAfterSeconds: 0 })
  tripFindMany.mockResolvedValue([])
})

describe('POST /api/vehicles/[id]/trips — who may', () => {
  it('is a 404 to a collaborator: a mechanic has no business with where the car went', async () => {
    mockAccess.mockResolvedValue({ ...COMPANY_VAN, access: 'collaborator' })
    expect((await POST(post(BODY), params)).status).toBe(404)
    expect(tripCreate).not.toHaveBeenCalled()
  })

  it('is Pro on a personal vehicle — the account of record’s plan', async () => {
    mockAccess.mockResolvedValue(PERSONAL_CAR)
    const res = await POST(post(BODY), params)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('UPGRADE_REQUIRED')
  })

  it('works on a personal vehicle whose owner has Pro', async () => {
    mockAccess.mockResolvedValue(PERSONAL_CAR)
    user.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, active: true, isPro: true, isProComped: false, displayName: 'Ana Pop' }))
    expect((await POST(post(BODY), params)).status).toBe(201)
  })
})

describe('POST — what is written', () => {
  it('writes both km as TRIP readings in the trip’s transaction, the driver being the caller', async () => {
    const res = await POST(post(BODY), params)
    expect(res.status).toBe(201)
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(readingCreate.mock.calls.map((c) => c[0].data)).toEqual([
      { vehicleId: 'v1', km: 1000, readAt: d('2026-03-05'), source: 'TRIP', createdByUserId: 'me' },
      { vehicleId: 'v1', km: 1042, readAt: d('2026-03-05'), source: 'TRIP', createdByUserId: 'me' },
    ])
    expect(tripCreate.mock.calls[0][0].data).toMatchObject({
      vehicleId: 'v1',
      driverUserId: 'me',
      driverName: 'Ana Pop',
      kind: 'BUSINESS',
      startReadingId: 'r1000',
      endReadingId: 'r1042',
    })
    // No distance column: it is derived from the two readings.
    expect(tripCreate.mock.calls[0][0].data).not.toHaveProperty('distance')
  })

  it('a driver is always the driver, whatever the body names', async () => {
    mockAccess.mockResolvedValue({ ...COMPANY_VAN, access: 'driver' })
    await POST(post({ ...BODY, driverUserId: 'someone-else' }), params)
    expect(tripCreate.mock.calls[0][0].data.driverUserId).toBe('me')
    expect(member).not.toHaveBeenCalled()
  })

  it('a manager may log a trip for a member of the organisation, and nobody else', async () => {
    member.mockResolvedValue({ userId: 'u2' })
    await POST(post({ ...BODY, driverUserId: 'u2' }), params)
    expect(tripCreate.mock.calls[0][0].data).toMatchObject({ driverUserId: 'u2', driverName: 'Bogdan Ionescu' })

    member.mockResolvedValue(null)
    const res = await POST(post({ ...BODY, driverUserId: 'stranger' }), params)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('tripDriverInvalid')
  })

  it('refuses an end below the start, a future day and an unknown kind', async () => {
    expect((await POST(post({ ...BODY, endKm: '990' }), params)).status).toBe(400)
    expect((await POST(post({ ...BODY, date: '2999-01-01' }), params)).status).toBe(400)
    const kind = await POST(post({ ...BODY, kind: 'COMMUTE' }), params)
    expect((await kind.json()).code).toBe('tripFieldInvalid')
    expect(tripCreate).not.toHaveBeenCalled()
  })

  it('a km that breaks the mileage history refuses the trip, naming the reading', async () => {
    readings.mockResolvedValue([{ id: 'later', km: 1020, readAt: d('2026-03-20'), isOverride: false, createdAt: d('2026-03-20') }])
    const res = await POST(post(BODY), params)
    expect(res.status).toBe(409)
    expect(tripCreate).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/vehicles/[id]/trips/[tripId]', () => {
  const del = () => DELETE(new NextRequest('http://localhost', { method: 'DELETE' }), { params: { id: 'v1', tripId: 't1' } })

  it('removes the trip and the two readings written with it', async () => {
    tripFind.mockResolvedValue({ id: 't1', vehicleId: 'v1', driverUserId: 'u2', startReadingId: 'r1', endReadingId: 'r2' })
    expect((await del()).status).toBe(200)
    expect(prisma.odometerReading.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['r1', 'r2'] }, vehicleId: 'v1', source: 'TRIP' } })
  })

  it('a driver removes only their own', async () => {
    mockAccess.mockResolvedValue({ ...COMPANY_VAN, access: 'driver' })
    tripFind.mockResolvedValue({ id: 't1', vehicleId: 'v1', driverUserId: 'u2', startReadingId: 'r1', endReadingId: 'r2' })
    expect((await del()).status).toBe(404)
    expect(prisma.trip.delete).not.toHaveBeenCalled()
  })

  it('does not reach a trip on another vehicle', async () => {
    tripFind.mockResolvedValue({ id: 't1', vehicleId: 'other', driverUserId: 'me', startReadingId: null, endReadingId: null })
    expect((await del()).status).toBe(404)
  })
})

describe('GET /api/vehicles/[id]/trips/export', () => {
  const get = (month = '2026-03') => exportVehicle(new NextRequest(`http://localhost/api/vehicles/v1/trips/export?month=${month}`), params)

  it('gives a driver their own trips only', async () => {
    mockAccess.mockResolvedValue({ ...COMPANY_VAN, access: 'driver' })
    await get()
    expect(tripFindMany.mock.calls[0][0].where).toEqual({ vehicleId: { in: ['v1'] }, date: { gte: d('2026-03-01'), lt: d('2026-04-01') }, driverUserId: 'me' })
  })

  it('gives a manager every trip and the odometer reconciliation', async () => {
    tripFindMany.mockResolvedValue([
      { id: 't1', vehicleId: 'v1', driverUserId: 'u2', driverName: 'Bogdan', date: d('2026-03-05'), fromPlace: '=cmd', toPlace: 'Turda', purpose: null, kind: 'BUSINESS', createdByUserId: 'u2', createdAt: d('2026-03-05'), startReading: { km: 1000 }, endReading: { km: 1042 } },
    ])
    readings.mockResolvedValue([
      { id: 'a', km: 990, readAt: d('2026-02-28'), isOverride: false, createdAt: d('2026-02-28') },
      { id: 'b', km: 1060, readAt: d('2026-03-30'), isOverride: false, createdAt: d('2026-03-30') },
    ])
    const res = await get()
    expect(tripFindMany.mock.calls[0][0].where).not.toHaveProperty('driverUserId')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="RigLog_Trips_CJ_10_ABC_2026-03.csv"')
    const text = await res.text()
    expect(text).toContain(`"'=cmd"`)
    expect(text).toContain('"Business km";"42"')
    expect(text).toContain('"Km not in any trip";"28"')
  })

  it('refuses a malformed month and counts against the report limit', async () => {
    expect((await get('March')).status).toBe(400)
    await get()
    expect(consumeRateLimit).toHaveBeenCalledWith('fleetReport', 'user:me')
  })
})

describe('GET /api/organizations/[orgId]/reports/trips', () => {
  const get = (query: string) => exportFleet(new NextRequest(`http://localhost/api/organizations/org1/reports/trips?${query}`), { params: { orgId: 'org1' } })

  it.each(['MECHANIC', 'DRIVER'])('is a 404 to a %s', async (role) => {
    member.mockResolvedValue({ role, organization: { id: 'org1', name: 'Transport SRL' } })
    expect((await get('month=2026-03')).status).toBe(404)
  })

  it('looks only at this organisation’s vehicles, whichever driver is asked for', async () => {
    member.mockResolvedValue({ role: 'FLEET_MANAGER', organization: { id: 'org1', name: 'Transport SRL' } })
    ;(prisma.vehicle.findMany as jest.Mock).mockResolvedValue([{ id: 'v1', year: 2019, make: 'Dacia', model: 'Dokker', plate: 'CJ 10 ABC' }])
    await get('month=2026-03&driver=u2')
    expect((prisma.vehicle.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ organizationId: 'org1' })
    expect(tripFindMany.mock.calls[0][0].where).toMatchObject({ vehicleId: { in: ['v1'] }, driverUserId: 'u2' })
  })
})

describe('the distance is never stored', () => {
  it('Trip has no distance or km column — the readings are the one source', () => {
    const schema = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
    const model = schema.slice(schema.indexOf('model Trip {'), schema.indexOf('}', schema.indexOf('model Trip {')))
    expect(model).not.toMatch(/\b(distance|startKm|endKm|km)\b\s+\w/)
  })
})
