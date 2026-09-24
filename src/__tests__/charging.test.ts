import fs from 'fs'
import path from 'path'

// RL-042: the read-only gate reads the owner's plan and vehicles, which
// these mocks do not model; readOnly.test.ts tests it on its own. One test
// below makes it refuse, to prove every write here consults it first.
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
    vehicle: { findUnique: jest.fn(), update: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    vehicleAssignment: { findFirst: jest.fn() },
    odometerReading: { findMany: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    chargeEntry: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  }
  return { prisma: client }
})

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { deleteUpload, saveUpload } from '@/lib/storage'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'
import { chargeSummary, parseChargeInput, parseSoc, parseTariff, pricePerKwh } from '@/lib/charging'
import { parseNonNegativeAmount } from '@/lib/fuel'
import { ODOMETER_SOURCES } from '@/lib/odometer'
import { MONEY_COLUMNS } from '@/lib/ownershipCosts'
import { POST } from '@/app/api/vehicles/[id]/charges/route'
import { DELETE, PATCH } from '@/app/api/vehicles/[id]/charges/[entryId]/route'
import { POST as POST_RECEIPT } from '@/app/api/vehicles/[id]/charges/[entryId]/receipt/route'
import { PUT as PUT_TARIFF } from '@/app/api/vehicles/[id]/charges/tariff/route'

const decimal = (n: number) => ({ toNumber: () => n })

describe('what a charge accepts', () => {
  it('accepts a free charge — zero is a real total, not a missing one', () => {
    expect(parseNonNegativeAmount(0, 100)).toEqual({ ok: true, value: 0 })
    expect(parseNonNegativeAmount('0', 100)).toEqual({ ok: true, value: 0 })
    expect(parseNonNegativeAmount('', 100)).toEqual({ ok: false })
    expect(parseNonNegativeAmount(-1, 100)).toEqual({ ok: false })
    const parsed = parseChargeInput({ totalRon: 0, kwh: 20, location: 'WORK' }, null)
    expect(parsed).toEqual({ ok: true, value: expect.objectContaining({ totalRon: 0, totalFromTariff: false }) })
  })

  it('takes a total with no kWh: it counts for cost, never for energy', () => {
    const parsed = parseChargeInput({ totalRon: '45,50', location: 'PUBLIC_DC' }, null)
    expect(parsed).toEqual({ ok: true, value: expect.objectContaining({ kwh: null, totalRon: 45.5 }) })
  })

  it('works out a home charge from the tariff only when the kWh is known, and says so', () => {
    expect(parseChargeInput({ kwh: '30', location: 'HOME' }, 1.25)).toEqual({
      ok: true,
      value: expect.objectContaining({ kwh: 30, totalRon: 37.5, totalFromTariff: true }),
    })
    // No tariff, no kWh, or not at home: nothing to work it out from.
    expect(parseChargeInput({ kwh: '30', location: 'HOME' }, null)).toEqual({ ok: false, code: 'chargeTotalNeeded' })
    expect(parseChargeInput({ location: 'HOME' }, 1.25)).toEqual({ ok: false, code: 'chargeTotalNeeded' })
    expect(parseChargeInput({ kwh: '30', location: 'PUBLIC_AC' }, 1.25)).toEqual({ ok: false, code: 'chargeTotalNeeded' })
  })

  it('prefers a total that was typed over the tariff', () => {
    expect(parseChargeInput({ kwh: '30', totalRon: '20', location: 'HOME' }, 1.25)).toEqual({
      ok: true,
      value: expect.objectContaining({ totalRon: 20, totalFromTariff: false }),
    })
  })

  it('never derives kWh from the battery percentage', () => {
    const parsed = parseChargeInput({ totalRon: 10, socFrom: 20, socTo: 80 }, null)
    expect(parsed).toEqual({ ok: true, value: expect.objectContaining({ kwh: null, socFrom: 20, socTo: 80 }) })
  })

  it.each([
    [{ totalRon: 10, location: 'GARAGE' }, 'chargeLocationInvalid'],
    [{ totalRon: 10, kwh: 0 }, 'chargeKwhInvalid'],
    [{ totalRon: 10, kwh: 5000 }, 'chargeKwhInvalid'],
    [{ totalRon: -1 }, 'chargeTotalInvalid'],
    [{ totalRon: 10, socFrom: 80, socTo: 80 }, 'chargeSocInvalid'],
    [{ totalRon: 10, socFrom: 90, socTo: 20 }, 'chargeSocInvalid'],
    [{ totalRon: 10, socTo: 101 }, 'chargeSocInvalid'],
    [{ totalRon: 10, socFrom: 12.5 }, 'chargeSocInvalid'],
  ])('refuses %j', (body, code) => {
    expect(parseChargeInput(body, null)).toEqual({ ok: false, code })
  })

  it('reads battery levels and tariffs, blank meaning "not recorded"', () => {
    expect(parseSoc('')).toEqual({ ok: true, value: null })
    expect(parseSoc('80')).toEqual({ ok: true, value: 80 })
    expect(parseTariff('')).toEqual({ ok: true, value: null })
    expect(parseTariff('1,2345')).toEqual({ ok: true, value: 1.2345 })
    expect(parseTariff(0)).toEqual({ ok: false })
    expect(parseTariff(11)).toEqual({ ok: false })
  })

  it('derives price per kWh, and has none without kWh', () => {
    expect(pricePerKwh(40, 90)).toBe(2.25)
    expect(pricePerKwh(null, 90)).toBeNull()
  })

  it('averages price by energy, and counts charges without kWh apart', () => {
    const summary = chargeSummary([
      { kwh: 10, totalRon: 30 },
      { kwh: 30, totalRon: 30 },
      { kwh: null, totalRon: 50 },
    ])
    // (30 + 30) / 40 — not the mean of 3 and 1.
    expect(summary).toEqual({ charges: 3, totalRon: 110, totalKwh: 40, withoutKwh: 1, averagePricePerKwh: 1.5 })
  })
})

describe('charging routes', () => {
  const mockSession = getServerSession as jest.Mock
  const params = { id: 'v1' }
  const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never
  const PERSONAL = { id: 'v1', ownerId: 'owner', organizationId: null, hideCostsFromCollaborators: false, homeTariffRonPerKwh: null }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
    mockSession.mockResolvedValue({ user: { id: 'owner' } })
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue(PERSONAL)
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.vehicleAssignment.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.odometerReading.findMany as jest.Mock).mockResolvedValue([
      { id: 'r0', km: 40_000, readAt: new Date('2025-01-15T00:00:00Z'), isOverride: false, createdAt: new Date() },
    ])
    ;(prisma.odometerReading.create as jest.Mock).mockResolvedValue({ id: 'r1' })
    ;(prisma.chargeEntry.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: 'c1', ...data, odometerReading: data.odometerReadingId ? { km: 41_000 } : null })
    )
  })

  it('POST records the charge and its km as a CHARGE reading', async () => {
    const res = await POST(req({ totalRon: '90', kwh: '40', km: '41000', location: 'PUBLIC_DC', date: '2025-03-01' }), { params })
    expect(res.status).toBe(201)
    expect(prisma.odometerReading.create).toHaveBeenCalledWith({
      data: { vehicleId: 'v1', km: 41_000, readAt: new Date('2025-03-01T00:00:00Z'), source: 'CHARGE', createdByUserId: 'owner' },
    })
    expect(await res.json()).toMatchObject({ kwh: 40, totalRon: 90, km: 41_000, pricePerKwh: 2.25, location: 'PUBLIC_DC' })
  })

  it('POST accepts a free charge', async () => {
    const res = await POST(req({ totalRon: 0, kwh: 22, location: 'WORK' }), { params })
    expect(res.status).toBe(201)
    expect((await res.json()).totalRon).toBe(0)
  })

  it('POST prices a home charge from the owner’s tariff and marks it', async () => {
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ ...PERSONAL, homeTariffRonPerKwh: decimal(1.1) })
    const res = await POST(req({ kwh: 50, location: 'HOME' }), { params })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ totalRon: 55, totalFromTariff: true })
  })

  it('POST refuses a km that breaks the odometer history, and saves nothing', async () => {
    const res = await POST(req({ totalRon: 10, km: 30_000, date: '2025-03-01' }), { params })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('odometerBelowEarlier')
    expect(prisma.chargeEntry.create).not.toHaveBeenCalled()
  })

  it('POST is 404 for someone with no access to the vehicle', async () => {
    mockSession.mockResolvedValue({ user: { id: 'stranger' } })
    const res = await POST(req({ totalRon: 10 }), { params })
    expect(res.status).toBe(404)
    expect(prisma.chargeEntry.create).not.toHaveBeenCalled()
  })

  it('POST lets an active collaborator log one', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'pc1' })
    const res = await POST(req({ totalRon: 10 }), { params })
    expect(res.status).toBe(201)
  })

  it('POST lets the assigned driver log one, and hands back no money', async () => {
    mockSession.mockResolvedValue({ user: { id: 'driver' } })
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ ...PERSONAL, ownerId: 'record', organizationId: 'o1' })
    ;(prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: 'DRIVER' })
    ;(prisma.vehicleAssignment.findFirst as jest.Mock).mockResolvedValue({ id: 'a1' })
    const res = await POST(req({ totalRon: 123.45, kwh: 40 }), { params })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.totalRon).toBeNull()
    expect(body.pricePerKwh).toBeNull()
    expect(JSON.stringify(body)).not.toContain('123.45')
  })

  describe('PATCH — correcting a charge', () => {
    const at = { params: { id: 'v1', entryId: 'c1' } }
    const stored = {
      id: 'c1', vehicleId: 'v1', createdByUserId: 'owner', date: new Date('2025-03-01T00:00:00Z'),
      totalRon: decimal(90), totalFromTariff: false, odometerReadingId: 'r1',
    }
    beforeEach(() => {
      ;(prisma.chargeEntry.findUnique as jest.Mock).mockResolvedValue(stored)
      ;(prisma.chargeEntry.update as jest.Mock).mockImplementation(({ data }) =>
        Promise.resolve({ id: 'c1', ...data, odometerReading: data.odometerReadingId ? { km: 41_500 } : null })
      )
      ;(prisma.odometerReading.findMany as jest.Mock).mockResolvedValue([
        { id: 'r0', km: 40_000, readAt: new Date('2025-01-15T00:00:00Z'), isOverride: false, createdAt: new Date() },
        { id: 'r1', km: 41_000, readAt: new Date('2025-03-01T00:00:00Z'), isOverride: false, createdAt: new Date() },
      ])
    })

    it('moves its reading with it, checked against the history but not against itself', async () => {
      const res = await PATCH(req({ totalRon: 95, kwh: 42, km: 41_500, location: 'PUBLIC_DC', date: '2025-03-02' }), at)
      expect(res.status).toBe(200)
      expect(prisma.odometerReading.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { km: 41_500, readAt: new Date('2025-03-02T00:00:00Z') } })
      expect(prisma.chargeEntry.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ totalRon: 95, kwh: 42, location: 'PUBLIC_DC', date: new Date('2025-03-02T00:00:00Z'), odometerReadingId: 'r1' }),
      }))
    })

    it('a blank km removes the reading it had', async () => {
      await PATCH(req({ totalRon: 90, km: '' }), at)
      expect(prisma.odometerReading.deleteMany).toHaveBeenCalledWith({ where: { id: 'r1', source: 'CHARGE' } })
      expect((prisma.chargeEntry.update as jest.Mock).mock.calls[0][0].data.odometerReadingId).toBeNull()
    })

    it('refuses a km that breaks the history, and changes nothing', async () => {
      const res = await PATCH(req({ totalRon: 90, km: 30_000 }), at)
      expect(res.status).toBe(409)
      expect(prisma.chargeEntry.update).not.toHaveBeenCalled()
      expect(prisma.odometerReading.update).not.toHaveBeenCalled()
    })

    it('someone else corrects only their own', async () => {
      mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
      ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'pc1' })
      const res = await PATCH(req({ totalRon: 1 }), at)
      expect([res.status, (await res.json()).code]).toEqual([403, 'chargeOwnOnly'])
    })

    it('a driver who never saw the total keeps it, and is not shown it', async () => {
      mockSession.mockResolvedValue({ user: { id: 'driver' } })
      ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ ...PERSONAL, ownerId: 'record', organizationId: 'o1' })
      ;(prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: 'DRIVER' })
      ;(prisma.vehicleAssignment.findFirst as jest.Mock).mockResolvedValue({ id: 'a1' })
      ;(prisma.chargeEntry.findUnique as jest.Mock).mockResolvedValue({ ...stored, createdByUserId: 'driver' })
      const res = await PATCH(req({ totalRon: '', kwh: 44, km: 41_200 }), at)
      expect(res.status).toBe(200)
      expect((prisma.chargeEntry.update as jest.Mock).mock.calls[0][0].data).toMatchObject({ totalRon: 90, totalFromTariff: false, kwh: 44 })
      const body = await res.json()
      expect(body.totalRon).toBeNull()
      expect(JSON.stringify(body)).not.toContain('90')
    })
  })

  it('every write asks the read-only gate first', async () => {
    const refusal = NextResponse.json({ code: 'readOnly' }, { status: 403 })
    ;(refuseIfReadOnly as jest.Mock).mockResolvedValueOnce(refusal)
    expect((await POST(req({ totalRon: 10 }), { params })).status).toBe(403)
    expect(prisma.chargeEntry.create).not.toHaveBeenCalled()
    ;(refuseIfReadOnly as jest.Mock).mockResolvedValueOnce(refusal)
    ;(prisma.chargeEntry.findUnique as jest.Mock).mockResolvedValue({ id: 'c1', vehicleId: 'v1', createdByUserId: 'owner' })
    expect((await DELETE({} as never, { params: { id: 'v1', entryId: 'c1' } })).status).toBe(403)
    expect(prisma.chargeEntry.delete).not.toHaveBeenCalled()
    ;(refuseIfReadOnly as jest.Mock).mockResolvedValueOnce(refusal)
    expect((await PATCH(req({ totalRon: 1 }), { params: { id: 'v1', entryId: 'c1' } })).status).toBe(403)
    expect(prisma.chargeEntry.update).not.toHaveBeenCalled()
    ;(refuseIfReadOnly as jest.Mock).mockResolvedValueOnce(refusal)
    expect((await PUT_TARIFF(req({ homeTariffRonPerKwh: 1 }), { params })).status).toBe(403)
    expect(prisma.vehicle.update).not.toHaveBeenCalled()
  })

  it('DELETE takes the charge’s own reading and receipt file with it', async () => {
    ;(prisma.chargeEntry.findUnique as jest.Mock).mockResolvedValue({
      id: 'c1', vehicleId: 'v1', createdByUserId: 'owner', odometerReadingId: 'r1', receiptUrl: 'owner/v1/ionity.pdf',
    })
    const res = await DELETE({} as never, { params: { id: 'v1', entryId: 'c1' } })
    expect(res.status).toBe(200)
    expect(prisma.chargeEntry.delete).toHaveBeenCalledWith({ where: { id: 'c1' } })
    expect(prisma.odometerReading.deleteMany).toHaveBeenCalledWith({ where: { id: 'r1', source: 'CHARGE' } })
    expect(deleteUpload).toHaveBeenCalledWith('owner/v1/ionity.pdf')
  })

  it('DELETE lets a collaborator remove only their own charges', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'pc1' })
    ;(prisma.chargeEntry.findUnique as jest.Mock).mockResolvedValue({ id: 'c1', vehicleId: 'v1', createdByUserId: 'owner' })
    const res = await DELETE({} as never, { params: { id: 'v1', entryId: 'c1' } })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('chargeOwnOnly')
  })

  it('DELETE is 404 for a charge on another vehicle', async () => {
    ;(prisma.chargeEntry.findUnique as jest.Mock).mockResolvedValue({ id: 'c1', vehicleId: 'other', createdByUserId: 'owner' })
    expect((await DELETE({} as never, { params: { id: 'v1', entryId: 'c1' } })).status).toBe(404)
  })

  it('a receipt is filed under the vehicle owner’s prefix, and its echo hides money from a driver', async () => {
    mockSession.mockResolvedValue({ user: { id: 'driver' } })
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ ...PERSONAL, ownerId: 'record', organizationId: 'o1' })
    ;(prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: 'DRIVER' })
    ;(prisma.vehicleAssignment.findFirst as jest.Mock).mockResolvedValue({ id: 'a1' })
    ;(prisma.chargeEntry.findUnique as jest.Mock).mockResolvedValue({ id: 'c1', vehicleId: 'v1', createdByUserId: 'driver', receiptUrl: null })
    ;(saveUpload as jest.Mock).mockResolvedValue('record/v1/uuid.jpg')
    ;(prisma.chargeEntry.update as jest.Mock).mockResolvedValue({ id: 'c1', kwh: 40, totalRon: 987.65, odometerReading: null })
    const form = new FormData()
    form.append('file', new File([new Uint8Array([1, 2, 3])], 'bon.jpg', { type: 'image/jpeg' }))
    const res = await POST_RECEIPT(
      { headers: new Headers({ 'content-type': 'multipart/form-data; boundary=x' }), formData: () => Promise.resolve(form) } as never,
      { params: { id: 'v1', entryId: 'c1' } }
    )
    expect(res.status).toBe(200)
    expect((saveUpload as jest.Mock).mock.calls[0][0]).toBe('record')
    expect(JSON.stringify(await res.json())).not.toContain('987.65')
  })

  it('the home tariff is the owner’s to set, and a blank clears it', async () => {
    ;(prisma.vehicle.update as jest.Mock).mockResolvedValue({ homeTariffRonPerKwh: decimal(1.2) })
    const res = await PUT_TARIFF(req({ homeTariffRonPerKwh: '1,2' }), { params })
    expect(res.status).toBe(200)
    expect(prisma.vehicle.update).toHaveBeenCalledWith(expect.objectContaining({ data: { homeTariffRonPerKwh: 1.2 } }))

    ;(prisma.vehicle.update as jest.Mock).mockResolvedValue({ homeTariffRonPerKwh: null })
    await PUT_TARIFF(req({ homeTariffRonPerKwh: '' }), { params })
    expect(prisma.vehicle.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { homeTariffRonPerKwh: null } }))

    expect((await (await PUT_TARIFF(req({ homeTariffRonPerKwh: 50 }), { params })).json()).code).toBe('chargeTariffInvalid')
  })

  it('a collaborator cannot set the tariff', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'pc1' })
    expect((await PUT_TARIFF(req({ homeTariffRonPerKwh: 1 }), { params })).status).toBe(404)
    expect(prisma.vehicle.update).not.toHaveBeenCalled()
  })
})

describe('the charging log reaches everything a fill-up does', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

  it('is an odometer source, labelled in both languages', () => {
    expect(ODOMETER_SOURCES).toContain('CHARGE')
    for (const locale of ['ro', 'en']) {
      const messages = JSON.parse(read(`messages/${locale}.json`))
      expect(typeof messages.odometer.source.CHARGE).toBe('string')
    }
  })

  it('lists charge receipts for erasure and exports charges', () => {
    const source = read('src/lib/personalData.ts')
    expect(source).toMatch(/chargeEntry\.findMany\(\{ where: \{ \.\.\.underVehicle, receiptUrl/)
    expect(source).toContain('chargeEntries: vehicle.chargeEntries.map')
  })

  it('counts as record activity on the passport', () => {
    expect(read('src/lib/passportRecords.ts')).toContain('prisma.chargeEntry.findMany')
  })

  it('has decided about its money column', () => {
    expect(MONEY_COLUMNS['ChargeEntry.totalRon']).toBeDefined()
  })

  // A plug-in hybrid gets both logs; a combustion or unknown vehicle keeps
  // exactly the links it had.
  it('links the logs by powertrain, never by fuel type', () => {
    for (const file of ['src/app/dashboard/vehicles/[id]/(overview)/page.tsx', 'src/components/DriverPanel.tsx']) {
      const source = read(file)
      expect(source).toMatch(/takesFuel\(powertrain\) && .*\/fuel|takesFuel\(powertrain\), \{ href: `\$\{base\}\/fuel`/)
      expect(source).toMatch(/takesCharge\(powertrain\) && .*\/charging|takesCharge\(powertrain\), \{ href: `\$\{base\}\/charging`/)
    }
  })
})
