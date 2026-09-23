import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { translator } from '@/i18n/translator'
import { localeFromRequest } from '@/i18n/requestLocale'
import { loadReadings } from '@/lib/odometerRecords'
import { parseMonth, reconcileMonth } from '@/lib/trips'
import { loadMonthTrips, tripGate } from '@/lib/tripRecords'
import { tripSheetCsv } from '@/lib/tripSheet'
import { asciiSlug } from '@/lib/downloadName'

// RL-051: one vehicle's trips for a month, as a CSV. A manager's file is
// every trip and the odometer reconciliation; a driver's is their own
// trips only — other people's trips are what fill the gaps, so a driver's
// file reconciles nothing.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const gate = await tripGate(vehicle)
  if (gate === 'forbidden') return await apiError('notFound', 404)
  if (gate === 'upgrade') return await apiError('proTrips', 403, { code: 'UPGRADE_REQUIRED' })

  const month = parseMonth(req.nextUrl.searchParams.get('month'))
  if (!month) return await apiError('tripMonthInvalid', 400)

  const limit = await consumeRateLimit('fleetReport', `user:${session.user.id}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  try {
    const manager = vehicle.access === 'owner'
    const trips = await loadMonthTrips({ vehicleIds: [vehicle.id], month, ...(manager ? {} : { driverUserId: session.user.id }) })
    const reconciliation = manager ? reconcileMonth(trips, await loadReadings(vehicle.id), month) : null
    const t = await translator(localeFromRequest(), 'trips')
    const csv = tripSheetCsv({ t, trips, vehicles: new Map([[vehicle.id, vehicle]]), reconciliation })
    const name = asciiSlug(vehicle.plate ?? `${vehicle.make} ${vehicle.model}`)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="RigLog_Trips_${name || 'vehicle'}_${month.key}.csv"`,
        'Cache-Control': 'no-store, private',
      },
    })
  } catch (e) {
    console.error('Trip sheet export failed:', e)
    return await apiError('reportFailed', 500)
  }
}
