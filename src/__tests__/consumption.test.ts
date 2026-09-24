import fs from 'fs'
import path from 'path'
import { chargeConsumption, chargeIntervals, combinedIntervals, combinedSummary, type ChargeMeasurable } from '@/lib/charging'
import type { FuelLike } from '@/lib/fuel'
import { measureIntervals } from '@/lib/consumption'

/**
 * RL-054 (#122). The fuel log's own cases live in fuel.test.ts and pass
 * unchanged on the shared walk; these are the charging log's, and the
 * plug-in hybrid's strict combined figure.
 */
const at = (day: string) => new Date(`${day}T00:00:00Z`)
const charge = (id: string, day: string, kwh: number | null, km: number | null, socTo: number | null = 80, totalRon = 0): ChargeMeasurable => ({
  id, date: at(day), kwh, km, socTo, totalRon,
})
const fill = (id: string, day: string, litres: number, km: number | null, isFullTank = true, totalRon = litres * 7): FuelLike => ({
  id, date: at(day), litres, totalRon, isFullTank, km,
})

describe('kWh per 100 km, between two charges to the same level', () => {
  it('measures 80% → 80%, not only full charges', () => {
    expect(chargeIntervals([charge('a', '2026-01-01', 30, 10_000), charge('b', '2026-01-08', 36, 10_200)])).toEqual([
      { startId: 'a', endId: 'b', amount: 36, km: 200, per100Km: 18 },
    ])
  })

  it('adds a partial charge in between, and never closes on a different level', () => {
    const intervals = chargeIntervals([
      charge('a', '2026-01-01', 30, 10_000, 80),
      charge('p', '2026-01-04', 10, 10_100, 60), // a stop at 60%
      charge('q', '2026-01-05', 5, 10_120, null), // no % recorded
      charge('b', '2026-01-08', 30, 10_300, 80),
    ])
    expect(intervals).toEqual([{ startId: 'a', endId: 'b', amount: 45, km: 300, per100Km: 15 }])
  })

  it('drops an interval with a charge of unknown kWh inside it — the energy is unknown', () => {
    const intervals = chargeIntervals([
      charge('a', '2026-01-01', 30, 10_000),
      charge('home', '2026-01-04', null, 10_100, null),
      charge('b', '2026-01-08', 30, 10_300),
      charge('c', '2026-01-15', 20, 10_400),
    ])
    // a→b is unknown; b→c is measured afresh from b.
    expect(intervals.map((i) => [i.startId, i.endId])).toEqual([['b', 'c']])
  })

  it('drops an interval whose closing charge has no kWh', () => {
    expect(chargeIntervals([charge('a', '2026-01-01', 30, 10_000), charge('b', '2026-01-08', null, 10_200)])).toEqual([])
  })

  it('drops an interval across an odometer override', () => {
    expect(chargeIntervals([charge('a', '2026-01-01', 30, 150_000), charge('b', '2026-02-01', 30, 400)], ['2026-01-15'])).toEqual([])
  })

  it('starts measuring again when the owner changes the level they charge to', () => {
    const intervals = chargeIntervals([
      charge('a', '2026-01-01', 30, 10_000, 80),
      charge('b', '2026-01-08', 40, 10_200, 90),
      charge('c', '2026-01-15', 36, 10_400, 90),
    ])
    expect(intervals.map((i) => [i.startId, i.endId])).toEqual([['b', 'c']])
  })

  it('never lets two intervals overlap, so no km is counted twice', () => {
    const intervals = chargeIntervals([
      charge('a', '2026-01-01', 30, 10_000, 80),
      charge('b', '2026-01-03', 20, 10_100, 60),
      charge('c', '2026-01-05', 20, 10_200, 80), // closes a→c; b is dropped as a start
      charge('d', '2026-01-07', 20, 10_300, 60),
    ])
    expect(intervals.map((i) => [i.startId, i.endId])).toEqual([['a', 'c']])
  })

  it('averages total kWh over total km, not the mean of the ratios', () => {
    const summary = chargeConsumption([
      charge('a', '2026-01-01', 30, 10_000),
      charge('b', '2026-01-02', 10, 10_025), // 40 kWh/100 km over a hop
      charge('c', '2026-01-20', 150, 11_025), // 15 over 1000 km
    ])
    expect(summary).toEqual({ averagePer100Km: 15.61, lastPer100Km: 15, measuredKm: 1025, intervals: 2 })
  })

  it('the shared walk measures nothing from one entry', () => {
    expect(measureIntervals([{ id: 'a', date: at('2026-01-01'), km: 1, amount: 1, level: 'full' }])).toEqual([])
  })
})

describe('a plug-in hybrid: litres and kWh together, only when both logs cover the stretch', () => {
  const fills = [fill('f1', '2026-03-01', 40, 20_000), fill('f2', '2026-03-20', 20, 21_000)]

  it('shows both per 100 km over a measured fuel interval, with the energy paid inside it', () => {
    const [interval] = combinedIntervals(fills, [
      charge('before', '2026-02-28', 10, null, null, 99), // before the stretch
      charge('c1', '2026-03-05', 8, null, null, 12),
      charge('c2', '2026-03-10', 12, null, 100, 0), // free
      charge('after', '2026-03-25', 10, null, null, 99),
    ])
    expect(interval).toEqual({
      startId: 'f1', endId: 'f2', km: 1000, litres: 20, kwh: 20, litresPer100Km: 2, kwhPer100Km: 2, energyRon: 140 + 12,
    })
  })

  it('shows nothing for a stretch where a charge has no kWh — strict, never a bare l/100 km', () => {
    expect(combinedIntervals(fills, [charge('c1', '2026-03-05', null, null, null, 20)])).toEqual([])
  })

  it('a stretch driven on fuel alone is still a real, measured figure', () => {
    expect(combinedIntervals(fills, [])[0]).toMatchObject({ kwh: 0, kwhPer100Km: 0, litresPer100Km: 2 })
  })

  it('places a same-day charge by km: before the first fill it is outside, after it inside', () => {
    const early = { ...charge('early', '2026-03-01', 5, 19_990, null), createdAt: at('2026-03-01') }
    const late = { ...charge('late', '2026-03-01', 7, 20_010, null) }
    expect(combinedIntervals(fills, [early, late])[0].kwh).toBe(7)
  })

  it('adds the stretches up by distance, with the energy cost per km', () => {
    const summary = combinedSummary(combinedIntervals(fills, [charge('c', '2026-03-05', 20, null, null, 30)]))
    expect(summary).toEqual({ litresPer100Km: 2, kwhPer100Km: 2, ronPerKm: 0.17, measuredKm: 1000, intervals: 1 })
    expect(combinedSummary([])).toBeNull()
  })
})

describe('the screens keep the rule', () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

  // A plug-in hybrid never shows a bare l/100 km: the average card and the
  // per-fill line are both on the non-plug-in branch.
  it('the fuel page shows l/100 km only when the vehicle is not a plug-in hybrid', () => {
    const source = read('src/app/dashboard/vehicles/[id]/fuel/page.tsx')
    expect(source).toMatch(/\{isPluginHybrid \? \([\s\S]*t\('combined'\)[\s\S]*\) : \([\s\S]*t\('average'\)/)
    expect(source).toContain("{!isPluginHybrid && interval && (")
  })

  it('the charging page measures kWh/100 km for an electric vehicle only', () => {
    expect(read('src/app/dashboard/vehicles/[id]/charging/page.tsx')).toContain("powertrain === 'ELECTRIC' ? chargeIntervals(")
  })
})
