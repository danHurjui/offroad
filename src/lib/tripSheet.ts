import { toCsv, type CsvValue } from './csv'
import { sortTrips, tripDistance, type MonthReconciliation } from './trips'
import type { LoadedTrip } from './tripRecords'

type T = (key: string, values?: Record<string, string | number>) => string

const km = (n: number) => n.toLocaleString('ro-RO')
const day = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

/**
 * RL-051: a month's trips as a CSV — per vehicle, or per driver across the
 * fleet. The rows are the trips; under them, after an empty line, the
 * month's totals, and for a vehicle sheet the odometer's own figure and
 * the km no trip accounts for, so the gap travels with the file.
 *
 * It is called what it is — the trips as recorded — and not a foaie de
 * parcurs: what ANAF requires on one has not been established, and a file
 * that claimed to be one and was refused would be worse.
 */
export function tripSheetCsv(args: {
  t: T
  trips: LoadedTrip[]
  vehicles: Map<string, { year: number; make: string; model: string; plate: string | null }>
  reconciliation: MonthReconciliation | null
}): string {
  const { t } = args
  const sorted = sortTrips(args.trips)
  const rows: CsvValue[][] = sorted.map((trip) => {
    const v = args.vehicles.get(trip.vehicleId)
    const distance = tripDistance(trip)
    return [
      day(trip.date),
      v ? `${v.year} ${v.make} ${v.model}` : '',
      v?.plate ?? '',
      trip.driverName,
      trip.fromPlace,
      trip.toPlace,
      trip.purpose,
      t(`kind.${trip.kind}`),
      trip.startKm === null ? '' : km(trip.startKm),
      trip.endKm === null ? '' : km(trip.endKm),
      distance === null ? '' : km(distance),
    ]
  })

  const business = sorted.filter((x) => x.kind === 'BUSINESS').reduce((s, x) => s + (tripDistance(x) ?? 0), 0)
  const personal = sorted.filter((x) => x.kind === 'PERSONAL').reduce((s, x) => s + (tripDistance(x) ?? 0), 0)
  const summary: CsvValue[][] = [[], [t('csv.totalBusiness'), km(business)], [t('csv.totalPersonal'), km(personal)]]
  const r = args.reconciliation
  if (r) {
    if (r.odometer) {
      summary.push([
        t('csv.odometer', { from: km(r.odometer.fromKm), fromDate: day(r.odometer.fromDate), to: km(r.odometer.toKm), toDate: day(r.odometer.toDate) }),
        km(r.odometer.km),
      ])
      summary.push([t('csv.unlogged'), km(r.unlogged ?? 0)])
    } else {
      summary.push([t('csv.noOdometer'), ''])
    }
    if (r.withoutDistance > 0) summary.push([t('csv.withoutDistance'), String(r.withoutDistance)])
  }

  return toCsv(
    [
      t('csv.date'),
      t('csv.vehicle'),
      t('csv.registration'),
      t('csv.driver'),
      t('csv.from'),
      t('csv.to'),
      t('csv.purpose'),
      t('csv.kind'),
      t('csv.startKm'),
      t('csv.endKm'),
      t('csv.distance'),
    ],
    [...rows, ...summary]
  )
}
