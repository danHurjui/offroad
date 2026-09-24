import { NextResponse } from 'next/server'
import type { Vehicle } from '@prisma/client'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { accessForRole } from '@/lib/access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { parseReportPeriod, type AssignmentSpan, type ReportPeriod } from '@/lib/fleetReport'
import type { CostLine } from '@/lib/ownershipCosts'
import { translator } from '@/i18n/translator'
import type { Locale } from '@/i18n/config'
import { asciiSlug } from '@/lib/downloadName'
import { loadMembership } from '../../load'
import { siteFromQuery } from '@/lib/siteRecords'
import { siteVehicleWhere, type SiteOption } from '@/lib/sites'

export interface LoadedReport {
  organization: { id: string; name: string }
  period: ReportPeriod
  /** #103: the site the report is narrowed to, if one was asked for. */
  site: SiteOption | null
  /** The organisation's vehicles in the report — all of them, the site's, or the one asked for. */
  vehicles: Vehicle[]
  /** Assignments on those vehicles that overlap the period, with the driver's name. */
  assignments: AssignmentSpan[]
}

/**
 * Everything a fleet report starts from, checked on the server whatever the
 * form offered (RL-041):
 * - the caller is an OWNER or FLEET_MANAGER of this organisation — anyone
 *   else gets the 404 the fleet pages give;
 * - one unit of `fleetReport` per user id, before the expensive reads;
 * - the period parses and is no longer than `REPORT_MAX_DAYS`;
 * - a `vehicle` asked for is one of *this organisation's* vehicles — any
 *   other id is a 404, never somebody else's records;
 * - a `site` asked for is one of this organisation's sites (404 otherwise),
 *   and narrows the vehicles to the ones kept there (#103).
 *
 * Only the organisation's current vehicles are reported: one moved out is
 * its new owner's, and its history went with it.
 */
export async function loadReport(
  organizationId: string,
  userId: string,
  params: URLSearchParams
): Promise<{ ok: true; report: LoadedReport } | { ok: false; error: Response }> {
  const loaded = await loadMembership(organizationId, userId)
  if (!loaded.ok) return loaded
  if (accessForRole(loaded.role) !== 'owner') return { ok: false, error: await apiError('notFound', 404) }

  const limit = await consumeRateLimit('fleetReport', `user:${userId}`)
  if (!limit.ok) return { ok: false, error: await rateLimitResponse(limit) }

  const parsed = parseReportPeriod(params.get('from'), params.get('to'))
  if (!parsed.ok) return { ok: false, error: await apiError(parsed.code, 400) }
  const { period } = parsed

  const site = await siteFromQuery(organizationId, params.get('site'))
  if (site === false) return { ok: false, error: await apiError('notFound', 404) }

  const all = await prisma.vehicle.findMany({ where: { organizationId, ...siteVehicleWhere(site) }, orderBy: { createdAt: 'asc' } })
  const wanted = params.get('vehicle')
  const vehicles = wanted ? all.filter((v) => v.id === wanted) : all
  if (wanted && vehicles.length === 0) return { ok: false, error: await apiError('notFound', 404) }

  const rows = vehicles.length
    ? await prisma.vehicleAssignment.findMany({
        where: {
          vehicleId: { in: vehicles.map((v) => v.id) },
          startedAt: { lt: period.end },
          OR: [{ endedAt: null }, { endedAt: { gte: period.from } }],
        },
        select: { vehicleId: true, startedAt: true, endedAt: true, driver: { select: { displayName: true } } },
      })
    : []

  return {
    ok: true,
    report: {
      organization: { id: loaded.membership.organization.id, name: loaded.membership.organization.name },
      period,
      site,
      vehicles,
      assignments: rows.map((a) => ({ vehicleId: a.vehicleId, startedAt: a.startedAt, endedAt: a.endedAt, driverName: a.driver.displayName })),
    },
  }
}

/** `14.03.2026`, the way the rest of the app prints a day. */
export const reportDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

export const vehicleTitle = (v: Pick<Vehicle, 'year' | 'make' | 'model'>) => `${v.year} ${v.make} ${v.model}`

/** A cost line's label, from the same catalogues the vehicle costs page reads. */
export async function costLineLabeller(locale: Locale): Promise<(line: CostLine) => string> {
  const [t, th, tt, te] = await Promise.all([
    translator(locale, 'ownership'),
    translator(locale, 'health'),
    translator(locale, 'tyres'),
    translator(locale, 'expenses'),
  ])
  return (line) => {
    const [ns, code] = line.labelKey.split('.')
    if (ns === 'doc') return th(`doc.${code}`)
    if (ns === 'season') return tt(`season.${code}`)
    if (ns === 'kind') return te(`kind.${code}`)
    return t(line.labelKey)
  }
}

const slug = asciiSlug

/**
 * File names carry what it is, whose, and the period, ASCII only — a
 * company name or a plate goes into a header, where a quote or a line
 * break would be an injection.
 */
export function reportFilename(parts: string[], period: ReportPeriod, ext: 'csv' | 'pdf'): string {
  const day = (d: Date) => d.toISOString().slice(0, 10)
  return `${['RigLog', ...parts.map(slug).filter(Boolean), day(period.from), day(period.to)].join('_')}.${ext}`
}

/** A download that holds a company's figures: never cached anywhere. */
export function reportResponse(body: BodyInit, contentType: string, filename: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, private',
    },
  })
}
