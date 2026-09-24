import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { accessForRole } from '@/lib/access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { translator } from '@/i18n/translator'
import { localeFromRequest } from '@/i18n/requestLocale'
import { parseMonth } from '@/lib/trips'
import { loadMonthTrips } from '@/lib/tripRecords'
import { tripSheetCsv } from '@/lib/tripSheet'
import { asciiSlug } from '@/lib/downloadName'
import { loadMembership } from '../../../load'
import { siteFromQuery } from '@/lib/siteRecords'
import { siteVehicleWhere } from '@/lib/sites'

// RL-051: a month's trips across the organisation's vehicles — one
// driver's sheet with `driver`, everyone's without. OWNER/FLEET_MANAGER
// only (404 otherwise, like the fleet pages). Scoped to this
// organisation's vehicles, so a driver id from anywhere else finds nothing.
export async function GET(req: NextRequest, { params }: { params: { orgId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadMembership(params.orgId, session.user.id)
  if (!loaded.ok) return loaded.error
  if (accessForRole(loaded.role) !== 'owner') return await apiError('notFound', 404)

  const month = parseMonth(req.nextUrl.searchParams.get('month'))
  if (!month) return await apiError('tripMonthInvalid', 400)
  const driver = req.nextUrl.searchParams.get('driver') || undefined
  // #103: one of this organisation's sites, or a 404.
  const site = await siteFromQuery(params.orgId, req.nextUrl.searchParams.get('site'))
  if (site === false) return await apiError('notFound', 404)

  const limit = await consumeRateLimit('fleetReport', `user:${session.user.id}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { organizationId: params.orgId, ...siteVehicleWhere(site) },
      select: { id: true, year: true, make: true, model: true, plate: true },
    })
    const trips = await loadMonthTrips({ vehicleIds: vehicles.map((v) => v.id), month, driverUserId: driver })
    const t = await translator(localeFromRequest(), 'trips')
    const csv = tripSheetCsv({ t, trips, vehicles: new Map(vehicles.map((v) => [v.id, v])), reconciliation: null })
    const who = driver ? trips[0]?.driverName ?? 'driver' : 'all'
    const name = ['RigLog', 'Trips', asciiSlug(loaded.membership.organization.name), site ? asciiSlug(site.name) : '', asciiSlug(who), month.key].filter(Boolean).join('_')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.csv"`,
        'Cache-Control': 'no-store, private',
      },
    })
  } catch (e) {
    console.error('Driver trip sheet export failed:', e)
    return await apiError('reportFailed', 500)
  }
}
