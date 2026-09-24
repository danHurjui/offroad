import fs from 'fs'
import path from 'path'

// RL-042: the read-only gate reads the owner's plan and vehicles, which
// these mocks do not model; readOnly.test.ts tests it on its own.
jest.mock('@/lib/vehicleAllowance', () => ({
  ...jest.requireActual('@/lib/vehicleAllowance'),
  refuseIfReadOnly: jest.fn(async () => null),
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/storage', () => ({
  saveUpload: jest.fn(),
  deleteUpload: jest.fn().mockResolvedValue(undefined),
  StorageError: class StorageError extends Error {},
  MAX_UPLOAD_BYTES: 4 * 1024 * 1024,
  ALLOWED_UPLOAD_TYPES: ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'],
}))
jest.mock('@/lib/prisma', () => {
  const client = {
    vehicle: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    odometerReading: { findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    fuelEntry: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  }
  return { prisma: client }
})

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { deleteUpload, saveUpload } from '@/lib/storage'
import { consumptionIntervals, fuelSummary, parsePositiveAmount, pricePerLitre, type FuelLike } from '@/lib/fuel'
import { POST } from '@/app/api/vehicles/[id]/fuel/route'
import { DELETE } from '@/app/api/vehicles/[id]/fuel/[entryId]/route'
import { POST as POST_RECEIPT } from '@/app/api/vehicles/[id]/fuel/[entryId]/receipt/route'

const fill = (id: string, day: string, litres: number, km: number | null, isFullTank = true, totalRon = litres * 7): FuelLike => ({
  id,
  date: new Date(`${day}T00:00:00Z`),
  litres,
  totalRon,
  isFullTank,
  km,
})

describe('consumption is only measured between two full tanks', () => {
  it('measures full → full', () => {
    const intervals = consumptionIntervals([fill('a', '2025-01-01', 50, 10_000), fill('b', '2025-01-20', 40, 10_500)])
    expect(intervals).toEqual([{ startId: 'a', endId: 'b', litres: 40, km: 500, litresPer100Km: 8 }])
  })

  it('counts partial fills in between, but never ends an interval on one', () => {
    const intervals = consumptionIntervals([
      fill('a', '2025-01-01', 50, 10_000),
      fill('p', '2025-01-10', 20, 10_300, false),
      fill('b', '2025-01-20', 25, 10_600),
    ])
    // 20 + 25 litres over 600 km.
    expect(intervals).toEqual([{ startId: 'a', endId: 'b', litres: 45, km: 600, litresPer100Km: 7.5 }])
  })

  it('produces nothing from partial fills alone — a wrong figure is worse than none', () => {
    expect(
      consumptionIntervals([fill('a', '2025-01-01', 50, 10_000, false), fill('b', '2025-01-20', 40, 10_500, false)])
    ).toEqual([])
  })

  it('ignores everything before the first full tank', () => {
    const intervals = consumptionIntervals([
      fill('p', '2024-12-20', 30, 9_700, false),
      fill('a', '2025-01-01', 50, 10_000),
      fill('b', '2025-01-20', 40, 10_500),
    ])
    expect(intervals.map((i) => i.startId)).toEqual(['a'])
  })

  it('drops an interval whose end has no km, and starts again from it', () => {
    const intervals = consumptionIntervals([
      fill('a', '2025-01-01', 50, 10_000),
      fill('b', '2025-01-20', 40, null),
      fill('c', '2025-02-05', 35, 11_000),
    ])
    // a→b has no km; b→c cannot be measured either (b has none).
    expect(intervals).toEqual([])
  })

  it('drops an interval across an odometer override (a replaced gauge)', () => {
    const entries = [fill('a', '2025-01-01', 50, 150_000), fill('b', '2025-02-01', 40, 500)]
    expect(consumptionIntervals(entries, ['2025-01-15'])).toEqual([])
  })

  it('averages by total litres over total km, not by the mean of ratios', () => {
    const summary = fuelSummary([
      fill('a', '2025-01-01', 50, 10_000),
      fill('b', '2025-01-02', 10, 10_050), // 20 l/100km over a short hop
      fill('c', '2025-01-20', 60, 11_050), // 6 l/100km over 1000 km
    ])
    expect(summary.averageLitresPer100Km).toBe(6.67) // 70 l / 1050 km
    expect(summary.lastLitresPer100Km).toBe(6)
    expect(summary.measuredKm).toBe(1050)
    expect(summary.fills).toBe(3)
  })

  it('has no average until something is measurable', () => {
    expect(fuelSummary([fill('a', '2025-01-01', 50, 10_000)]).averageLitresPer100Km).toBeNull()
  })
})

describe('amounts', () => {
  it('accepts a Romanian decimal comma', () => {
    expect(parsePositiveAmount('42,37', 2000)).toEqual({ ok: true, value: 42.37 })
  })

  it.each([0, -5, 'x', null, 2001])('refuses %p', (v) => {
    expect(parsePositiveAmount(v, 2000)).toEqual({ ok: false })
  })

  it('derives price per litre instead of storing it', () => {
    expect(pricePerLitre(42.37, 301.5)).toBe(7.116)
    expect(pricePerLitre(0, 10)).toBeNull()
  })
})

describe('fuel routes', () => {
  const mockSession = getServerSession as jest.Mock
  const params = { id: 'v1' }
  const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never

  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
    mockSession.mockResolvedValue({ user: { id: 'owner' } })
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ id: 'v1', ownerId: 'owner' })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.odometerReading.findMany as jest.Mock).mockResolvedValue([
      { id: 'r0', km: 120_000, readAt: new Date('2025-01-15T00:00:00Z'), isOverride: false, createdAt: new Date() },
    ])
    ;(prisma.odometerReading.create as jest.Mock).mockResolvedValue({ id: 'r1' })
    ;(prisma.fuelEntry.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: 'f1', ...data, odometerReading: data.odometerReadingId ? { km: 121_000 } : null })
    )
  })

  it('POST records the fill-up and its km as a FUEL reading, full tank by default', async () => {
    const res = await POST(req({ totalRon: '301,50', litres: '42.37', km: '121000', date: '2025-03-01' }), { params })
    expect(res.status).toBe(201)
    expect(prisma.odometerReading.create).toHaveBeenCalledWith({
      data: { vehicleId: 'v1', km: 121_000, readAt: new Date('2025-03-01T00:00:00Z'), source: 'FUEL', createdByUserId: 'owner' },
    })
    expect(prisma.fuelEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ litres: 42.37, totalRon: 301.5, isFullTank: true, odometerReadingId: 'r1' }),
      })
    )
    const body = await res.json()
    expect(body).toMatchObject({ litres: 42.37, totalRon: 301.5, km: 121_000, pricePerLitre: 7.116 })
  })

  it('POST works without a km, and writes no reading', async () => {
    const res = await POST(req({ totalRon: 300, litres: 42 }), { params })
    expect(res.status).toBe(201)
    expect(prisma.odometerReading.create).not.toHaveBeenCalled()
  })

  it('POST refuses a km that breaks the odometer history, and saves nothing', async () => {
    const res = await POST(req({ totalRon: 300, litres: 42, km: 100_000, date: '2025-03-01' }), { params })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('odometerBelowEarlier')
    expect(prisma.fuelEntry.create).not.toHaveBeenCalled()
  })

  it.each([
    [{ totalRon: 300, litres: 0 }, 'fuelLitresInvalid'],
    [{ totalRon: 0, litres: 40 }, 'fuelTotalInvalid'],
    [{ totalRon: 300, litres: 40, km: 12.5 }, 'odometerKmInvalid'],
    [{ totalRon: 300, litres: 40, date: '2999-01-01' }, 'odometerFuture'],
  ])('POST refuses %j', async (body, code) => {
    const res = await POST(req(body), { params })
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe(code)
  })

  it('DELETE takes the fill-up’s own reading and receipt file with it', async () => {
    ;(prisma.fuelEntry.findUnique as jest.Mock).mockResolvedValue({
      id: 'f1', vehicleId: 'v1', createdByUserId: 'owner', odometerReadingId: 'r1', receiptUrl: 'owner/v1/omv.jpg',
    })
    const res = await DELETE({} as never, { params: { id: 'v1', entryId: 'f1' } })
    expect(res.status).toBe(200)
    expect(prisma.fuelEntry.delete).toHaveBeenCalledWith({ where: { id: 'f1' } })
    // Only a FUEL reading — never one that came from elsewhere.
    expect(prisma.odometerReading.deleteMany).toHaveBeenCalledWith({ where: { id: 'r1', source: 'FUEL' } })
    expect(deleteUpload).toHaveBeenCalledWith('owner/v1/omv.jpg')
  })

  it('DELETE lets a collaborator remove only their own fill-ups', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    ;(prisma.fuelEntry.findUnique as jest.Mock).mockResolvedValue({ id: 'f1', vehicleId: 'v1', createdByUserId: 'owner' })
    const res = await DELETE({} as never, { params: { id: 'v1', entryId: 'f1' } })
    expect(res.status).toBe(403)
    expect(prisma.fuelEntry.delete).not.toHaveBeenCalled()
  })

  it('a receipt is filed under the vehicle owner’s prefix, whoever uploads it', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    ;(prisma.fuelEntry.findUnique as jest.Mock).mockResolvedValue({ id: 'f1', vehicleId: 'v1', createdByUserId: 'mechanic', receiptUrl: null })
    ;(saveUpload as jest.Mock).mockResolvedValue('owner/v1/uuid.jpg')
    ;(prisma.fuelEntry.update as jest.Mock).mockResolvedValue({ id: 'f1', litres: 40, totalRon: 300, odometerReading: null })
    const file = new File([new Uint8Array([1, 2, 3])], 'bon.jpg', { type: 'image/jpeg' })
    const form = new FormData()
    form.append('file', file)
    const res = await POST_RECEIPT(
      { headers: new Headers({ 'content-type': 'multipart/form-data; boundary=x' }), formData: () => Promise.resolve(form) } as never,
      { params: { id: 'v1', entryId: 'f1' } }
    )
    expect(res.status).toBe(200)
    expect((saveUpload as jest.Mock).mock.calls[0][0]).toBe('owner')
  })
})

describe('fuel receipts are covered by erasure and export', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/personalData.ts'), 'utf8')

  it('lists fuel receipts in collectStorageKeys()', () => {
    expect(source).toMatch(/prisma\.fuelEntry\.findMany\(\{[^}]*receiptUrl/)
  })

  it('exports fill-ups with their amounts as numbers', () => {
    expect(source).toMatch(/fuelEntries: vehicle\.fuelEntries\.map/)
  })
})
