import {
  currentMonth,
  fuelSplit,
  parseMonth,
  parseTripText,
  reconcileMonth,
  shiftMonth,
  sortTrips,
  tripDistance,
  type TripLike,
} from '@/lib/trips'
import type { ReadingLike } from '@/lib/odometer'

const d = (s: string) => new Date(`${s}T00:00:00Z`)
const MARCH = parseMonth('2026-03')!

let seq = 0
const trip = (date: string, startKm: number | null, endKm: number | null, kind = 'BUSINESS'): TripLike => ({
  id: `t${++seq}`,
  date: d(date),
  kind,
  createdAt: new Date(`${date}T12:00:00Z`),
  startKm,
  endKm,
})
const reading = (date: string, km: number, isOverride = false): ReadingLike => ({ id: `r${date}${km}`, km, readAt: d(date), isOverride, createdAt: d(date) })

describe('parseTripText', () => {
  it('takes the places, the purpose and the kind, trimmed', () => {
    expect(parseTripText({ fromPlace: ' Cluj ', toPlace: 'Turda', purpose: '', kind: 'PERSONAL' })).toEqual({
      ok: true,
      data: { fromPlace: 'Cluj', toPlace: 'Turda', purpose: null, kind: 'PERSONAL' },
    })
  })

  it.each([
    [{ toPlace: 'B', kind: 'BUSINESS' }, 'fromPlace'],
    [{ fromPlace: 'A', toPlace: '  ', kind: 'BUSINESS' }, 'toPlace'],
    [{ fromPlace: 'A', toPlace: 'B', purpose: 'x'.repeat(201), kind: 'BUSINESS' }, 'purpose'],
    [{ fromPlace: 'A', toPlace: 'B', kind: 'COMMUTE' }, 'kind'],
  ])('names the field it refuses: %j', (body, field) => {
    expect(parseTripText(body)).toEqual({ ok: false, field })
  })
})

describe('months', () => {
  it('parses YYYY-MM and nothing else', () => {
    expect(parseMonth('2026-03')).toEqual({ key: '2026-03', from: d('2026-03-01'), end: d('2026-04-01') })
    for (const bad of ['2026-13', '2026-3', '2026-03-01', '', null]) expect(parseMonth(bad)).toBeNull()
  })

  it('steps across a year end', () => {
    expect(shiftMonth(parseMonth('2026-12')!, 1).key).toBe('2027-01')
    expect(shiftMonth(parseMonth('2026-01')!, -1).key).toBe('2025-12')
    expect(currentMonth(new Date('2026-09-23T10:00:00Z')).key).toBe('2026-09')
  })
})

describe('tripDistance', () => {
  it('is end minus start, and unknown when a reading is gone or they run backwards', () => {
    expect(tripDistance({ startKm: 1000, endKm: 1042 })).toBe(42)
    expect(tripDistance({ startKm: null, endKm: 1042 })).toBeNull()
    expect(tripDistance({ startKm: 1100, endKm: 1042 })).toBeNull()
  })

  it('sorts trips in the order they were driven', () => {
    const late = trip('2026-03-05', 1200, 1250)
    const early = trip('2026-03-05', 1100, 1150)
    expect(sortTrips([late, early]).map((t) => t.id)).toEqual([early.id, late.id])
  })
})

describe('reconcileMonth — the gap is shown, not smoothed', () => {
  it('adds up business and personal km', () => {
    const trips = [trip('2026-03-02', 1000, 1100), trip('2026-03-03', 1100, 1130, 'PERSONAL')]
    const r = reconcileMonth(trips, [reading('2026-03-02', 1000), reading('2026-03-03', 1130)], MARCH)
    expect([r.business, r.personal, r.unlogged, r.gaps]).toEqual([100, 30, 0, []])
  })

  it('measures from the last reading before the month, and names each stretch no trip covers', () => {
    const a = trip('2026-03-02', 1020, 1100)
    const b = trip('2026-03-10', 1150, 1200, 'PERSONAL')
    const readings = [reading('2026-02-27', 1000), reading('2026-03-02', 1020), reading('2026-03-02', 1100), reading('2026-03-10', 1150), reading('2026-03-10', 1200), reading('2026-03-28', 1260)]
    const r = reconcileMonth([b, a], readings, MARCH)
    expect(r.odometer).toEqual({ fromKm: 1000, fromDate: d('2026-02-27'), toKm: 1260, toDate: d('2026-03-28'), km: 260 })
    expect(r.unlogged).toBe(260 - 80 - 50)
    expect(r.gaps).toEqual([
      { afterTripId: null, beforeTripId: a.id, km: 20 },
      { afterTripId: a.id, beforeTripId: b.id, km: 50 },
      { afterTripId: b.id, beforeTripId: null, km: 60 },
    ])
  })

  it('an odometer replaced between two trips makes that gap unknown, not a number', () => {
    const a = trip('2026-03-02', 150_000, 150_100)
    const b = trip('2026-03-20', 20, 80)
    const readings = [reading('2026-03-02', 150_000), reading('2026-03-02', 150_100), reading('2026-03-10', 0, true), reading('2026-03-20', 20), reading('2026-03-20', 80)]
    expect(reconcileMonth([a, b], readings, MARCH).gaps).toEqual([{ afterTripId: a.id, beforeTripId: b.id, km: null }])
  })

  it('reports an overlap as a negative gap rather than hiding it', () => {
    const a = trip('2026-03-02', 1000, 1100)
    const b = trip('2026-03-02', 1090, 1120)
    expect(reconcileMonth([a, b], [reading('2026-03-02', 1000), reading('2026-03-02', 1120)], MARCH).gaps).toEqual([
      { afterTripId: a.id, beforeTripId: b.id, km: -10 },
    ])
  })

  it('says nothing about the odometer with fewer than two readings', () => {
    const r = reconcileMonth([trip('2026-03-02', 1000, 1100)], [reading('2026-03-02', 1000)], MARCH)
    expect(r.odometer).toBeNull()
    expect(r.unlogged).toBeNull()
  })

  it('counts trips that lost a reading instead of adding them as zero', () => {
    const r = reconcileMonth([trip('2026-03-02', null, 1100)], [], MARCH)
    expect([r.withoutDistance, r.business]).toEqual([1, 0])
  })
})

describe('fuelSplit — an allocation by distance, labelled as one', () => {
  it('divides the month’s fuel by odometer km', () => {
    const a = trip('2026-03-02', 1000, 1300)
    const b = trip('2026-03-05', 1300, 1400, 'PERSONAL')
    const r = reconcileMonth([a, b], [reading('2026-03-01', 1000), reading('2026-03-31', 1500)], MARCH)
    expect(fuelSplit(400, r)).toEqual({ fuelRon: 400, perKm: 0.8, business: 240, personal: 80, unlogged: 80 })
  })

  it('offers nothing without an odometer figure or fuel', () => {
    const r = reconcileMonth([], [], MARCH)
    expect(fuelSplit(400, r)).toBeNull()
  })
})
