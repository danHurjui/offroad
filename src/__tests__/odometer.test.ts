import fs from 'fs'
import path from 'path'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    odometerReading: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import {
  checkReading,
  currentReading,
  distanceCovered,
  parseKm,
  startOfDayUtc,
  type ReadingLike,
} from '@/lib/odometer'
import { POST } from '@/app/api/vehicles/[id]/odometer/route'
import { DELETE } from '@/app/api/vehicles/[id]/odometer/[readingId]/route'

const r = (id: string, km: number, day: string, isOverride = false, createdAt = day): ReadingLike => ({
  id,
  km,
  readAt: new Date(`${day}T00:00:00Z`),
  isOverride,
  createdAt: new Date(`${createdAt}T12:00:00Z`),
})
const at = (km: number, day: string, isOverride = false) => ({ km, readAt: new Date(`${day}T00:00:00Z`), isOverride })

const HISTORY = [r('a', 100_000, '2024-01-10'), r('b', 110_000, '2024-06-01'), r('c', 120_000, '2025-01-15')]

describe('checkReading: readings stay in date order', () => {
  it('accepts the next reading going up', () => {
    expect(checkReading(HISTORY, at(125_000, '2025-03-01'))).toEqual({ ok: true })
  })

  it('refuses a newer reading lower than an older one, naming it', () => {
    const check = checkReading(HISTORY, at(119_000, '2025-03-01'))
    expect(check).toEqual({ ok: false, kind: 'belowEarlier', conflict: HISTORY[2] })
  })

  it('accepts history typed in late, as long as it fits between its neighbours', () => {
    // Entering last year's ITP mileage today is adding history, not an error.
    expect(checkReading(HISTORY, at(105_000, '2024-03-01'))).toEqual({ ok: true })
  })

  it('refuses back-filled history that is higher than a later reading', () => {
    const check = checkReading(HISTORY, at(115_000, '2024-03-01'))
    expect(check).toEqual({ ok: false, kind: 'aboveLater', conflict: HISTORY[1] })
  })

  it('does not order two readings on the same day against each other', () => {
    expect(checkReading(HISTORY, at(119_500, '2025-01-15'))).toEqual({ ok: true })
  })

  it('ignores the reading being edited', () => {
    expect(checkReading(HISTORY, at(111_000, '2025-01-15'), 'c')).toEqual({ ok: true })
  })

  it('always accepts an override — that is what it is for', () => {
    expect(checkReading(HISTORY, at(12, '2025-03-01', true))).toEqual({ ok: true })
  })

  it('never checks bounds across an override', () => {
    // Cluster swapped in March 2025 and reset to 0.
    const history = [...HISTORY, r('d', 0, '2025-03-01', true), r('e', 4_000, '2025-05-01')]
    expect(checkReading(history, at(6_000, '2025-06-01'))).toEqual({ ok: true })
    // Before the swap, the old segment's bounds still apply…
    expect(checkReading(history, at(121_000, '2025-02-01'))).toEqual({ ok: true })
    // …and the new segment's readings do not bound it from above.
    expect(checkReading(history, at(130_000, '2025-02-20'))).toEqual({ ok: true })
    // Inside the new segment, the rule applies again.
    expect(checkReading(history, at(3_000, '2025-06-01'))).toMatchObject({ ok: false, kind: 'belowEarlier' })
  })
})

describe('currentReading', () => {
  it('is the newest by date, not by entry order', () => {
    const typedLate = r('old', 90_000, '2023-01-01', false, '2026-09-01')
    expect(currentReading([...HISTORY, typedLate])?.id).toBe('c')
  })

  it('breaks a same-day tie by what was entered last', () => {
    const morning = r('m', 120_010, '2025-01-15', false, '2025-01-15')
    const evening = { ...r('e', 120_090, '2025-01-15'), createdAt: new Date('2025-01-15T20:00:00Z') }
    expect(currentReading([morning, evening])?.id).toBe('e')
  })

  it('is null with no history', () => {
    expect(currentReading([])).toBeNull()
  })
})

describe('distanceCovered', () => {
  it('sums the history', () => {
    expect(distanceCovered(HISTORY)).toBe(20_000)
  })

  it('does not count a cluster swap as negative distance', () => {
    const history = [...HISTORY, r('d', 0, '2025-03-01', true), r('e', 4_000, '2025-05-01')]
    expect(distanceCovered(history)).toBe(24_000)
  })
})

describe('parseKm', () => {
  it('reads whole kilometres and treats blank as none', () => {
    expect(parseKm('146230')).toEqual({ ok: true, km: 146_230 })
    expect(parseKm('')).toEqual({ ok: true, km: null })
    expect(parseKm(undefined)).toEqual({ ok: true, km: null })
  })

  it.each(['-1', '12.5', 'lots', 3_000_001])('refuses %p', (value) => {
    expect(parseKm(value)).toEqual({ ok: false })
  })
})

describe('startOfDayUtc', () => {
  it('stores every reading at midnight UTC of its day', () => {
    expect(startOfDayUtc(new Date('2025-05-01T18:30:00Z')).toISOString()).toBe('2025-05-01T00:00:00.000Z')
  })
})

describe('odometer routes', () => {
  const mockSession = getServerSession as jest.Mock
  const mockVehicle = prisma.vehicle.findUnique as jest.Mock
  const mockCollaborator = prisma.projectCollaborator.findFirst as jest.Mock
  const mockFindMany = prisma.odometerReading.findMany as jest.Mock
  const mockFindUnique = prisma.odometerReading.findUnique as jest.Mock
  const mockCreate = prisma.odometerReading.create as jest.Mock
  const mockDelete = prisma.odometerReading.delete as jest.Mock
  const params = { id: 'v1' }
  const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never

  beforeEach(() => {
    jest.clearAllMocks()
    mockSession.mockResolvedValue({ user: { id: 'owner' } })
    mockVehicle.mockResolvedValue({ id: 'v1', ownerId: 'owner' })
    mockCollaborator.mockResolvedValue(null)
    mockFindMany.mockResolvedValue(HISTORY)
    mockCreate.mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data }))
  })

  it('POST records a reading at midnight UTC of its day', async () => {
    const res = await POST(req({ km: '125000', readAt: '2025-03-01T15:00:00Z' }), { params })
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        km: 125_000,
        readAt: new Date('2025-03-01T00:00:00Z'),
        source: 'MANUAL',
        isOverride: false,
        overrideReason: null,
        createdByUserId: 'owner',
      }),
    })
  })

  it('POST refuses an out-of-order reading with 409, naming the reading it hit', async () => {
    const res = await POST(req({ km: 119000, readAt: '2025-03-01' }), { params })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.code).toBe('odometerBelowEarlier')
    expect(body.conflict).toEqual({ id: 'c', km: 120_000, readAt: '2025-01-15' })
    expect(body.error).toContain('15.01.2025')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('POST keeps the same reading as a recorded exception when a reason is given', async () => {
    const res = await POST(req({ km: 12, readAt: '2025-03-01', overrideReason: 'CLUSTER_REPLACED' }), { params })
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ km: 12, isOverride: true, overrideReason: 'CLUSTER_REPLACED' }),
    })
  })

  it('POST refuses an unknown override reason rather than treating it as one', async () => {
    const res = await POST(req({ km: 12, readAt: '2025-03-01', overrideReason: 'BECAUSE' }), { params })
    expect(res.status).toBe(400)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('POST refuses a reading dated in the future', async () => {
    const res = await POST(req({ km: 130000, readAt: '2999-01-01' }), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('odometerFuture')
  })

  it('POST refuses a km that is not a whole number', async () => {
    for (const km of ['', '12.5', -3]) {
      const res = await POST(req({ km, readAt: '2025-03-01' }), { params })
      expect(res.status).toBe(400)
    }
  })

  it('POST lets an active collaborator record a reading', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    mockCollaborator.mockResolvedValue({ id: 'c1' })
    const res = await POST(req({ km: 125000, readAt: '2025-03-01' }), { params })
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ createdByUserId: 'mechanic' }) })
  })

  it('POST is 404 to someone with no access to the vehicle', async () => {
    mockSession.mockResolvedValue({ user: { id: 'stranger' } })
    const res = await POST(req({ km: 125000 }), { params })
    expect(res.status).toBe(404)
  })

  it('DELETE lets the owner remove any reading', async () => {
    mockFindUnique.mockResolvedValue({ id: 'r1', vehicleId: 'v1', createdByUserId: 'mechanic' })
    const res = await DELETE({} as never, { params: { id: 'v1', readingId: 'r1' } })
    expect(res.status).toBe(200)
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'r1' } })
  })

  it('DELETE lets a collaborator remove only their own readings', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    mockCollaborator.mockResolvedValue({ id: 'c1' })
    mockFindUnique.mockResolvedValue({ id: 'r1', vehicleId: 'v1', createdByUserId: 'owner' })
    const refused = await DELETE({} as never, { params: { id: 'v1', readingId: 'r1' } })
    expect(refused.status).toBe(403)
    // A reading whose writer's account is gone falls the safe way too.
    mockFindUnique.mockResolvedValue({ id: 'r2', vehicleId: 'v1', createdByUserId: null })
    const orphan = await DELETE({} as never, { params: { id: 'v1', readingId: 'r2' } })
    expect(orphan.status).toBe(403)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('DELETE is 404 for a reading on another vehicle', async () => {
    mockFindUnique.mockResolvedValue({ id: 'r1', vehicleId: 'other', createdByUserId: 'owner' })
    const res = await DELETE({} as never, { params: { id: 'v1', readingId: 'r1' } })
    expect(res.status).toBe(404)
  })
})

describe('the odometer invariants in the source', () => {
  const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

  it('never stores a current mileage on Vehicle', () => {
    const schema = read('prisma/schema.prisma')
    const vehicle = schema.slice(schema.indexOf('model Vehicle {'), schema.indexOf('\n}', schema.indexOf('model Vehicle {')))
    expect(vehicle).not.toMatch(/\b(km|mileage|odometer|currentKm)\b\s+Int/i)
  })

  it('puts readings into the personal-data export', () => {
    expect(read('src/lib/personalData.ts')).toMatch(/odometerReadings:/)
  })
})
