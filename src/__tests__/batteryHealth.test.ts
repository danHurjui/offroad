import fs from 'fs'
import path from 'path'

// RL-042: the read-only gate is tested on its own (readOnly.test.ts); one
// test below makes it refuse, to prove every write here consults it first.
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
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn(), update: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    vehicleAssignment: { findFirst: jest.fn() },
    batteryHealthReading: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
  },
}))

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { deleteUpload, saveUpload } from '@/lib/storage'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'
import { parseBatteryReadingInput, parseWarranty } from '@/lib/batteryHealth'
import { computeHealth, DEFAULT_SERVICE_INTERVAL, type HealthInput } from '@/lib/vehicleHealth'
import { buildPassport, type PassportInput } from '@/lib/passport'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { POST } from '@/app/api/vehicles/[id]/battery/route'
import { DELETE, PATCH } from '@/app/api/vehicles/[id]/battery/[readingId]/route'
import { POST as POST_REPORT } from '@/app/api/vehicles/[id]/battery/[readingId]/report/route'
import { PUT as PUT_WARRANTY } from '@/app/api/vehicles/[id]/battery/warranty/route'

const NOW = new Date('2026-09-23T12:00:00Z')
const day = (d: string) => new Date(`${d}T00:00:00Z`)
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')

describe('what a battery reading accepts', () => {
  it('a whole-number state of health from 1 to 100, with its source', () => {
    expect(parseBatteryReadingInput({ sohPercent: '87', source: 'CAR_DISPLAY', km: '84000', note: ' after the winter ' })).toEqual({
      ok: true,
      value: { sohPercent: 87, source: 'CAR_DISPLAY', km: 84_000, note: 'after the winter' },
    })
    for (const bad of [0, 101, 87.5, '', 'high', undefined]) {
      expect(parseBatteryReadingInput({ sohPercent: bad })).toEqual({ ok: false, code: 'batterySohInvalid' })
    }
  })

  it('defaults the source to a workshop test and refuses one it does not know', () => {
    expect(parseBatteryReadingInput({ sohPercent: 90 })).toMatchObject({ ok: true, value: { source: 'WORKSHOP_TEST', km: null, note: null } })
    expect(parseBatteryReadingInput({ sohPercent: 90, source: 'GUESS' })).toEqual({ ok: false, code: 'batterySourceInvalid' })
    expect(parseBatteryReadingInput({ sohPercent: 90, km: -1 })).toEqual({ ok: false, code: 'batteryKmInvalid' })
  })

  it('the warranty is a real day and a whole km, each optional', () => {
    expect(parseWarranty({ batteryWarrantyUntil: '2031-03-12', batteryWarrantyKm: '160000' })).toEqual({
      ok: true,
      value: { batteryWarrantyUntil: day('2031-03-12'), batteryWarrantyKm: 160_000 },
    })
    expect(parseWarranty({ batteryWarrantyUntil: '', batteryWarrantyKm: '' })).toEqual({
      ok: true,
      value: { batteryWarrantyUntil: null, batteryWarrantyKm: null },
    })
    expect(parseWarranty({ batteryWarrantyUntil: '2031-02-30' })).toEqual({ ok: false, field: 'batteryWarrantyUntil' })
    expect(parseWarranty({ batteryWarrantyKm: 0 })).toEqual({ ok: false, field: 'batteryWarrantyKm' })
  })
})

function input(o: Partial<HealthInput> = {}): HealthInput {
  return { vehicleId: 'v1', projectType: 'DAILY_DRIVER', now: NOW, documents: [], tasks: [], readings: [], tyreSets: [], ...o }
}
const row = (i: HealthInput, id: string) => computeHealth(i).rows.find((r) => r.id === id)
const service = { id: 't1', name: 'Revizie', category: 'SERVICING', status: 'DONE', date: day('2026-03-01') }
const reading = (date: string, km: number, isOverride = false) => ({ id: `r${date}`, km, readAt: day(date), isOverride, createdAt: day(date) })

describe('the default service interval follows the powertrain', () => {
  it('is 15,000 km / a year for every powertrain with an engine, and unchanged', () => {
    for (const fuelType of [null, 'PETROL', 'DIESEL', 'HYBRID', 'PLUGIN_HYBRID', 'OTHER']) {
      expect(row(input({ fuelType, tasks: [service] }), 'service')).toMatchObject({ tone: 'ok', reason: { key: 'service.dueTime' } })
    }
    expect(DEFAULT_SERVICE_INTERVAL.PLUGIN_HYBRID).toEqual({ km: 15_000, days: 365 })
  })

  // The owner's decision on #124: no assumed figure for an electric car.
  it('has none for an electric car: the row asks for the owner’s interval', () => {
    expect(DEFAULT_SERVICE_INTERVAL.ELECTRIC).toBeNull()
    for (const tasks of [[], [service]]) {
      const r = row(input({ fuelType: 'ELECTRIC', tasks }), 'service')!
      expect(r).toMatchObject({ tone: 'none', reason: { key: 'service.noDefault' }, action: { key: 'nextAction.setServiceInterval' } })
      expect(r.href).toBe('/dashboard/vehicles/v1/edit#service-interval')
    }
  })

  it('an electric car with the owner’s own interval is measured by it', () => {
    const r = row(input({ fuelType: 'ELECTRIC', tasks: [service], serviceInterval: { km: null, months: 24 } }), 'service')
    expect(r).toMatchObject({ tone: 'ok', reason: { key: 'service.ownDueTime', values: { months: 24 } } })
  })

  it('the edit form has the anchor the prompt links to', () => {
    expect(read('src/components/VehicleEditForm.tsx')).toContain('id="service-interval"')
  })
})

describe('the high-voltage battery row: recorded, never rated', () => {
  const soh = (date: string, sohPercent: number, source = 'WORKSHOP_TEST') => ({ date: day(date), sohPercent, source })
  const battery = (readings: ReturnType<typeof soh>[], warrantyUntil: Date | null = null, warrantyKm: number | null = null) => ({
    readings,
    warrantyUntil,
    warrantyKm,
  })

  it('appears only for a vehicle that plugs in, and not for a restoration', () => {
    expect(row(input({ fuelType: 'PETROL' }), 'battery')).toBeUndefined()
    expect(row(input({ fuelType: 'HYBRID' }), 'battery')).toBeUndefined()
    expect(row(input({ fuelType: 'PLUGIN_HYBRID' }), 'battery')).toBeDefined()
    expect(row(input({ fuelType: 'ELECTRIC', projectType: 'RESTORATION' }), 'battery')).toBeUndefined()
  })

  it('with no readings it is none, never ok', () => {
    expect(row(input({ fuelType: 'ELECTRIC' }), 'battery')).toMatchObject({
      tone: 'none',
      reason: { key: 'battery.none' },
      action: { key: 'nextAction.recordBattery' },
    })
  })

  it('one reading is stated with its day and source', () => {
    expect(row(input({ fuelType: 'ELECTRIC', battery: battery([soh('2026-05-02', 91, 'CAR_DISPLAY')]) }), 'battery')).toMatchObject({
      tone: 'info',
      reason: { key: 'battery.recorded', values: { soh: 91, date: '02.05.2026', source: 'CAR_DISPLAY' } },
    })
  })

  it('several show the latest beside the first, whatever order they were given in', () => {
    const r = row(input({ fuelType: 'ELECTRIC', battery: battery([soh('2026-05-02', 88), soh('2024-04-10', 97)]) }), 'battery')
    expect(r?.reason).toEqual({
      key: 'battery.recordedSince',
      values: { soh: 88, date: '02.05.2026', source: 'WORKSHOP_TEST', firstSoh: 97, firstDate: '10.04.2024' },
    })
  })

  it('is information whatever the figure — no threshold makes it a warning', () => {
    for (const value of [100, 70, 40, 1]) {
      const report = computeHealth(input({ fuelType: 'ELECTRIC', battery: battery([soh('2026-05-02', value)]) }))
      expect(report.rows.find((r) => r.id === 'battery')?.tone).toBe('info')
    }
  })
})

describe('the battery warranty row: whichever comes first', () => {
  const ev = (warrantyUntil: Date | null, warrantyKm: number | null, readings = [reading('2026-09-01', 100_000)]) =>
    input({ fuelType: 'ELECTRIC', readings, battery: { readings: [], warrantyUntil, warrantyKm } })

  it('asks for the terms when none are recorded — never a default', () => {
    expect(row(ev(null, null), 'warranty')).toMatchObject({ tone: 'none', reason: { key: 'warranty.none' }, action: { key: 'nextAction.setWarranty' } })
  })

  it('by date: the day count is getDocumentStatus()’s, and it warns inside 90 days', () => {
    expect(row(ev(day('2027-09-23'), null), 'warranty')).toMatchObject({ tone: 'ok', reason: { key: 'warranty.dateOnly', values: { days: 365 } } })
    expect(row(ev(day('2026-12-01'), null), 'warranty')).toMatchObject({
      tone: 'warn',
      action: { key: 'nextAction.batteryBeforeWarranty' },
    })
  })

  it('by km: from the newest reading, and it warns inside 5,000 km', () => {
    expect(row(ev(null, 160_000), 'warranty')).toMatchObject({ tone: 'ok', reason: { key: 'warranty.kmOnly', values: { limitKm: 160_000, km: 60_000 } } })
    expect(row(ev(null, 104_000), 'warranty')).toMatchObject({ tone: 'warn', reason: { values: { km: 4_000 } } })
  })

  it('with both, whichever runs out first decides', () => {
    // Years to go, but only 3,000 km.
    expect(row(ev(day('2030-01-01'), 103_000), 'warranty')).toMatchObject({ tone: 'warn', reason: { key: 'warranty.both' } })
    // Plenty of km, but only 30 days.
    expect(row(ev(day('2026-10-23'), 160_000), 'warranty')).toMatchObject({ tone: 'warn', reason: { key: 'warranty.both' } })
    expect(row(ev(day('2030-01-01'), 160_000), 'warranty')).toMatchObject({ tone: 'ok' })
  })

  it('ended by either limit is stated, not alarmed: there is nothing left to do', () => {
    expect(row(ev(day('2026-01-01'), 160_000), 'warranty')).toMatchObject({ tone: 'info', reason: { key: 'warranty.endedDate' } })
    expect(row(ev(day('2030-01-01'), 90_000), 'warranty')).toMatchObject({ tone: 'info', reason: { key: 'warranty.endedKm', values: { limitKm: 90_000 } } })
  })

  it('a km limit with no current km — or after a replaced gauge — is unknown, never fine', () => {
    expect(row(ev(null, 160_000, []), 'warranty')).toMatchObject({ tone: 'none', reason: { key: 'warranty.kmUnknown' } })
    const swapped = [reading('2026-01-01', 150_000), reading('2026-02-01', 0, true), reading('2026-09-01', 8_000)]
    expect(row(ev(null, 160_000, swapped), 'warranty')).toMatchObject({ tone: 'none' })
    expect(row(ev(day('2030-01-01'), 160_000, swapped), 'warranty')).toMatchObject({ tone: 'ok', reason: { key: 'warranty.dateKmUnknown' } })
  })
})

describe('the passport lists battery readings as recorded', () => {
  function passportInput(o: Partial<PassportInput> = {}): PassportInput {
    return {
      now: NOW,
      projectType: 'DAILY_DRIVER',
      options: { showPlate: false, showVin: false, showCosts: true },
      vehicle: { year: 2021, make: 'Dacia', model: 'Spring', generation: null, plate: null, vin: null, purchaseDate: day('2024-01-10'), createdAt: day('2024-02-01') },
      rows: [],
      readings: [],
      fuelDates: [],
      documents: [],
      accidents: [],
      tyreSets: [],
      ...o,
    }
  }
  const r = (date: string, sohPercent: number) => ({ date: day(date), sohPercent, km: null, source: 'WORKSHOP_TEST', note: null, createdAt: day('2026-09-01') })

  it('oldest first, with when each was entered', () => {
    const p = buildPassport(passportInput({ fuelType: 'ELECTRIC', batteryReadings: [r('2026-05-02', 88), r('2024-04-10', 97)] }))
    expect(p.battery.shown).toBe(true)
    expect(p.battery.readings.map((x) => x.sohPercent)).toEqual([97, 88])
    expect(p.battery.readings[0].recordedAt).toEqual(day('2026-09-01'))
    expect(p.absences.map((a) => a.key)).not.toContain('absence.noBatteryReadingsRecorded')
  })

  it('a reading corrected a day or more after it was entered says when', () => {
    const corrected = { ...r('2026-05-02', 88), updatedAt: day('2026-09-10') }
    const same = { ...r('2026-05-03', 87), updatedAt: day('2026-09-01') }
    const p = buildPassport(passportInput({ fuelType: 'ELECTRIC', batteryReadings: [corrected, same] }))
    expect(p.battery.readings.map((x) => x.changedAt)).toEqual([day('2026-09-10'), null])
  })

  it('with none, for a vehicle that plugs in, says no reading was recorded in RigLog', () => {
    const p = buildPassport(passportInput({ fuelType: 'PLUGIN_HYBRID' }))
    expect(p.battery).toEqual({ shown: true, readings: [] })
    expect(p.absences.map((a) => a.key)).toContain('absence.noBatteryReadingsRecorded')
  })

  it('says nothing about a battery on a vehicle that does not plug in', () => {
    const p = buildPassport(passportInput({ fuelType: 'DIESEL' }))
    expect(p.battery.shown).toBe(false)
    expect(p.absences.map((a) => a.key)).not.toContain('absence.noBatteryReadingsRecorded')
  })

  it('battery readings count as record activity, so they close a gap', () => {
    const without = buildPassport(passportInput({ fuelType: 'ELECTRIC' }))
    expect(without.gaps.map((g) => g.to)).toEqual([NOW])
    const withReading = buildPassport(passportInput({ fuelType: 'ELECTRIC', batteryReadings: [r('2025-06-01', 95)] }))
    expect(withReading.gaps.map((g) => g.to)).toEqual([day('2025-06-01'), NOW])
  })

  it.each(['en', 'ro'])('%s: the absence names RigLog, and no string calls a battery healthy', (locale) => {
    const messages = JSON.parse(read(`messages/${locale}.json`))
    expect(messages.passport.absence.noBatteryReadingsRecorded).toContain('RigLog')
    const battery = JSON.stringify([messages.battery, messages.passport, messages.health])
    expect(battery).not.toMatch(/\bhealthy\b|good battery|battery is (fine|good|ok)|baterie (bună|sănătoasă)|sănătoasă\b/i)
  })
})

describe('the job vocabulary', () => {
  it('a daily driver has a high-voltage battery category, labelled in both languages', () => {
    expect(PROJECT_TYPE_CONFIG.DAILY_DRIVER.categories.map((c) => c.value)).toContain('HV_BATTERY')
    for (const locale of ['en', 'ro']) {
      expect(typeof JSON.parse(read(`messages/${locale}.json`)).vocab.category.DAILY_DRIVER.HV_BATTERY).toBe('string')
    }
  })

  it('the 12V battery stays under Electrical, and engine/exhaust stay (plug-in hybrids have both)', () => {
    const values = PROJECT_TYPE_CONFIG.DAILY_DRIVER.categories.map((c) => c.value)
    expect(values).toEqual(expect.arrayContaining(['ELECTRICAL', 'ENGINE', 'EXHAUST']))
  })
})

describe('battery routes', () => {
  const mockSession = getServerSession as jest.Mock
  const params = { id: 'v1' }
  const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never
  const PERSONAL = { id: 'v1', ownerId: 'owner', organizationId: null, hideCostsFromCollaborators: false }

  beforeEach(() => {
    jest.clearAllMocks()
    mockSession.mockResolvedValue({ user: { id: 'owner' } })
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue(PERSONAL)
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.vehicleAssignment.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.batteryHealthReading.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 'b1', ...data }))
  })

  it('POST records a reading on the day of the test, and never as an odometer reading', async () => {
    const res = await POST(req({ sohPercent: 91, source: 'WORKSHOP_TEST', date: '2026-09-01', km: 84_000 }), { params })
    expect(res.status).toBe(201)
    expect(prisma.batteryHealthReading.create).toHaveBeenCalledWith({
      data: { vehicleId: 'v1', date: day('2026-09-01'), sohPercent: 91, km: 84_000, source: 'WORKSHOP_TEST', note: null, createdByUserId: 'owner' },
    })
    expect((prisma as unknown as Record<string, unknown>).odometerReading).toBeUndefined()
  })

  it('POST refuses a bad figure and a future day', async () => {
    expect((await (await POST(req({ sohPercent: 120 }), { params })).json()).code).toBe('batterySohInvalid')
    expect((await POST(req({ sohPercent: 90, date: '2099-01-01' }), { params })).status).toBe(400)
    expect(prisma.batteryHealthReading.create).not.toHaveBeenCalled()
  })

  it('POST is 404 for someone with no access, and open to an active collaborator', async () => {
    mockSession.mockResolvedValue({ user: { id: 'stranger' } })
    expect((await POST(req({ sohPercent: 90 }), { params })).status).toBe(404)
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'pc1' })
    expect((await POST(req({ sohPercent: 90 }), { params })).status).toBe(201)
  })

  it('DELETE: a collaborator removes only their own, and the report file goes with it', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'pc1' })
    ;(prisma.batteryHealthReading.findUnique as jest.Mock).mockResolvedValue({ id: 'b1', vehicleId: 'v1', createdByUserId: 'owner', reportUrl: null })
    const refused = await DELETE({} as never, { params: { id: 'v1', readingId: 'b1' } })
    expect([refused.status, (await refused.json()).code]).toEqual([403, 'batteryOwnOnly'])

    ;(prisma.batteryHealthReading.findUnique as jest.Mock).mockResolvedValue({ id: 'b1', vehicleId: 'v1', createdByUserId: 'mechanic', reportUrl: 'owner/v1/soh.pdf' })
    expect((await DELETE({} as never, { params: { id: 'v1', readingId: 'b1' } })).status).toBe(200)
    expect(deleteUpload).toHaveBeenCalledWith('owner/v1/soh.pdf')
  })

  it('DELETE is 404 for a reading on another vehicle', async () => {
    ;(prisma.batteryHealthReading.findUnique as jest.Mock).mockResolvedValue({ id: 'b1', vehicleId: 'other', createdByUserId: 'owner' })
    expect((await DELETE({} as never, { params: { id: 'v1', readingId: 'b1' } })).status).toBe(404)
    expect(prisma.batteryHealthReading.delete).not.toHaveBeenCalled()
  })

  it('PATCH corrects a reading, checked like a new one', async () => {
    ;(prisma.batteryHealthReading.findUnique as jest.Mock).mockResolvedValue({ id: 'b1', vehicleId: 'v1', createdByUserId: 'mechanic', date: day('2026-09-01') })
    ;(prisma.batteryHealthReading.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 'b1', ...data }))
    const at = { params: { id: 'v1', readingId: 'b1' } }
    const res = await PATCH(req({ sohPercent: 89, source: 'CAR_DISPLAY', date: '2026-08-30', km: '', note: '' }), at)
    expect(res.status).toBe(200)
    expect(prisma.batteryHealthReading.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { sohPercent: 89, source: 'CAR_DISPLAY', km: null, note: null, date: day('2026-08-30') },
    })
    expect((await (await PATCH(req({ sohPercent: 0 }), at)).json()).code).toBe('batterySohInvalid')
    expect((await PATCH(req({ sohPercent: 90, date: '2099-01-01' }), at)).status).toBe(400)
  })

  it('PATCH: someone else corrects only their own', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'pc1' })
    ;(prisma.batteryHealthReading.findUnique as jest.Mock).mockResolvedValue({ id: 'b1', vehicleId: 'v1', createdByUserId: 'owner', date: day('2026-09-01') })
    const res = await PATCH(req({ sohPercent: 80 }), { params: { id: 'v1', readingId: 'b1' } })
    expect([res.status, (await res.json()).code]).toEqual([403, 'batteryOwnOnly'])
    expect(prisma.batteryHealthReading.update).not.toHaveBeenCalled()
  })

  it('a report is filed under the owner’s prefix whoever uploads it', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'pc1' })
    ;(prisma.batteryHealthReading.findUnique as jest.Mock).mockResolvedValue({ id: 'b1', vehicleId: 'v1', createdByUserId: 'mechanic', reportUrl: null })
    ;(saveUpload as jest.Mock).mockResolvedValue('owner/v1/uuid.pdf')
    ;(prisma.batteryHealthReading.update as jest.Mock).mockResolvedValue({ id: 'b1', reportUrl: 'owner/v1/uuid.pdf' })
    const form = new FormData()
    form.append('file', new File(['%PDF'], 'soh.pdf', { type: 'application/pdf' }))
    const res = await POST_REPORT({ formData: () => Promise.resolve(form) } as never, { params: { id: 'v1', readingId: 'b1' } })
    expect(res.status).toBe(200)
    expect((saveUpload as jest.Mock).mock.calls[0][0]).toBe('owner')
  })

  it('the warranty is the owner’s to set; a collaborator gets 404', async () => {
    ;(prisma.vehicle.update as jest.Mock).mockResolvedValue({ batteryWarrantyUntil: day('2031-03-12'), batteryWarrantyKm: 160_000 })
    const res = await PUT_WARRANTY(req({ batteryWarrantyUntil: '2031-03-12', batteryWarrantyKm: 160000 }), { params })
    expect(res.status).toBe(200)
    // New terms re-arm the reminder.
    expect(prisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { batteryWarrantyUntil: day('2031-03-12'), batteryWarrantyKm: 160_000, batteryWarrantyRemindedAt: null } })
    )
    expect((await (await PUT_WARRANTY(req({ batteryWarrantyKm: 'lots' }), { params })).json()).code).toBe('batteryWarrantyInvalid')

    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'pc1' })
    ;(prisma.vehicle.update as jest.Mock).mockClear()
    expect((await PUT_WARRANTY(req({ batteryWarrantyKm: 1 }), { params })).status).toBe(404)
    expect(prisma.vehicle.update).not.toHaveBeenCalled()
  })

  it('saving the same warranty terms again leaves the sent reminder alone', async () => {
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ ...PERSONAL, batteryWarrantyUntil: day('2031-03-12'), batteryWarrantyKm: 160_000 })
    ;(prisma.vehicle.update as jest.Mock).mockResolvedValue({ batteryWarrantyUntil: day('2031-03-12'), batteryWarrantyKm: 160_000 })
    await PUT_WARRANTY(req({ batteryWarrantyUntil: '2031-03-12', batteryWarrantyKm: 160000 }), { params })
    expect(prisma.vehicle.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { batteryWarrantyUntil: day('2031-03-12'), batteryWarrantyKm: 160_000 } })
    )
  })

  it('every write asks the read-only gate first', async () => {
    const refusal = NextResponse.json({ code: 'readOnly' }, { status: 403 })
    ;(refuseIfReadOnly as jest.Mock).mockResolvedValueOnce(refusal)
    expect((await POST(req({ sohPercent: 90 }), { params })).status).toBe(403)
    expect(prisma.batteryHealthReading.create).not.toHaveBeenCalled()
    ;(refuseIfReadOnly as jest.Mock).mockResolvedValueOnce(refusal)
    ;(prisma.batteryHealthReading.findUnique as jest.Mock).mockResolvedValue({ id: 'b1', vehicleId: 'v1', createdByUserId: 'owner' })
    expect((await DELETE({} as never, { params: { id: 'v1', readingId: 'b1' } })).status).toBe(403)
    expect(prisma.batteryHealthReading.delete).not.toHaveBeenCalled()
    ;(refuseIfReadOnly as jest.Mock).mockResolvedValueOnce(refusal)
    expect((await PATCH(req({ sohPercent: 80 }), { params: { id: 'v1', readingId: 'b1' } })).status).toBe(403)
    expect(prisma.batteryHealthReading.update).not.toHaveBeenCalled()
    ;(refuseIfReadOnly as jest.Mock).mockResolvedValueOnce(refusal)
    expect((await PUT_WARRANTY(req({ batteryWarrantyKm: 1 }), { params })).status).toBe(403)
    expect(prisma.vehicle.update).not.toHaveBeenCalled()
  })
})

describe('battery records reach everything a charge does', () => {
  it('lists report files for erasure and exports the readings', () => {
    const source = read('src/lib/personalData.ts')
    expect(source).toMatch(/batteryHealthReading\.findMany\(\{ where: \{ \.\.\.underVehicle, reportUrl/)
    expect(source).toContain('batteryHealthReadings: { orderBy')
  })

  it('the passport never loads a report key', () => {
    expect(read('src/lib/passportRecords.ts')).not.toMatch(/reportUrl/)
  })
})
