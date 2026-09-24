import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { accessForRole } from '@/lib/access'
import { currentMonth, parseMonth, shiftMonth, sortTrips, tripDistance } from '@/lib/trips'
import { loadMonthTrips } from '@/lib/tripRecords'
import { pickSite, siteVehicleWhere } from '@/lib/sites'
import { loadSites } from '@/lib/siteRecords'
import SiteFilterSelect from '@/components/SiteFilterSelect'

const km = (n: number) => n.toLocaleString('ro-RO')
const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

type Params = { params: { orgId: string }; searchParams: { month?: string; driver?: string; site?: string } }

// RL-051: a month's trips across the fleet, per driver — the driver's
// monthly sheet. For OWNER and FLEET_MANAGER, like the rest of the fleet
// pages; a 404 otherwise. Each vehicle's own page reconciles its trips
// against the odometer; this one is who drove where.
export default async function FleetTripsPage({ params, searchParams }: Params) {
  const t = await getTranslations('trips')
  const tf = await getTranslations('fleet')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: params.orgId, userId: session.user.id } },
    include: { organization: { select: { id: true, name: true } } },
  })
  if (!membership || accessForRole(membership.role) !== 'owner') notFound()
  const org = membership.organization

  const month = parseMonth(searchParams.month) ?? currentMonth()
  // #103: a site narrows the sheet to trips on its vehicles.
  const sites = await loadSites(org.id)
  const site = pickSite(sites, searchParams.site)
  const [vehicles, members] = await Promise.all([
    prisma.vehicle.findMany({ where: { organizationId: org.id, ...siteVehicleWhere(site) }, select: { id: true, year: true, make: true, model: true, plate: true } }),
    prisma.organizationMember.findMany({
      where: { organizationId: org.id },
      select: { user: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])
  const driver = members.find((m) => m.user.id === searchParams.driver)?.user ?? null
  const trips = sortTrips(await loadMonthTrips({ vehicleIds: vehicles.map((v) => v.id), month, driverUserId: driver?.id }))
  const byVehicle = new Map(vehicles.map((v) => [v.id, v]))

  // Totals per driver, business and personal.
  const perDriver = new Map<string, { name: string; business: number; personal: number; trips: number }>()
  for (const trip of trips) {
    const key = trip.driverUserId ?? `name:${trip.driverName}`
    const row = perDriver.get(key) ?? { name: trip.driverName, business: 0, personal: 0, trips: 0 }
    const distance = tripDistance(trip) ?? 0
    if (trip.kind === 'BUSINESS') row.business += distance
    else row.personal += distance
    row.trips += 1
    perDriver.set(key, row)
  }

  const monthName = new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(month.from)
  const filters = `${driver ? `&driver=${driver.id}` : ''}${site ? `&site=${site.id}` : ''}`
  const query = (key: string) => `?month=${key}${filters}`
  const exportHref = `/api/organizations/${org.id}/reports/trips?month=${month.key}${filters}`

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/dashboard/organizations/${org.id}/fleet`} className="mb-4 inline-block text-sm text-brand-600 hover:underline dark:text-brand-300">
        {tc('backTo', { screen: tf('title') })}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('fleetTitle')}</h1>
      <p className="mb-2 text-sm text-ink-muted">{t('fleetIntro')}</p>
      <p className="note-warn mb-6 rounded-lg p-3 text-xs">{t('notOfficial')}</p>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="month" value={month.key} />
        <SiteFilterSelect id="trips-site" sites={sites} selected={site} label={tf('filterSite')} allLabel={tf('allSites')} />
        <div className="min-w-0">
          <label className="label" htmlFor="trips-driver">{t('driver')}</label>
          <select id="trips-driver" name="driver" className="input" defaultValue={driver?.id ?? ''}>
            <option value="">{t('allDrivers')}</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>{m.user.displayName}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">{tf('apply')}</button>
      </form>

      <nav className="mb-4 flex items-center justify-between gap-2" aria-label={t('monthNav')}>
        <Link href={query(shiftMonth(month, -1).key)} className="btn-secondary">← {t('previous')}</Link>
        <span className="font-medium capitalize text-ink">{monthName}</span>
        <Link href={query(shiftMonth(month, 1).key)} className="btn-secondary">{t('next')} →</Link>
      </nav>

      {perDriver.size > 0 && (
        <div className="card mb-4 overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="sr-only">{t('perDriverCaption')}</caption>
            <thead>
              <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="p-3">{t('driver')}</th>
                <th scope="col" className="p-3 text-right">{t('tripsCount')}</th>
                <th scope="col" className="p-3 text-right">{t('kind.BUSINESS')}</th>
                <th scope="col" className="p-3 text-right">{t('kind.PERSONAL')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {[...perDriver.entries()].map(([key, row]) => (
                <tr key={key}>
                  <th scope="row" className="p-3 text-left font-medium text-ink">{row.name}</th>
                  <td className="p-3 text-right">{row.trips}</td>
                  <td className="p-3 text-right">{km(row.business)} km</td>
                  <td className="p-3 text-right">{km(row.personal)} km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {trips.length === 0 ? (
        <p className="card mb-4 p-4 text-sm text-ink-faint">{t('empty')}</p>
      ) : (
        <ul className="card mb-4 divide-y divide-surface-border">
          {trips.map((trip) => {
            const v = byVehicle.get(trip.vehicleId)
            const distance = tripDistance(trip)
            return (
              <li key={trip.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-ink">
                    {fmtDate(trip.date)} · {trip.fromPlace} → {trip.toPlace}
                  </div>
                  <div className="text-xs text-ink-muted">
                    <span className={`badge mr-1 ${trip.kind === 'BUSINESS' ? 'badge-brand' : 'bg-surface-subtle text-ink-muted'}`}>{t(`kind.${trip.kind}`)}</span>
                    {trip.driverName}
                    {v && (
                      <>
                        {' · '}
                        <Link href={`/dashboard/vehicles/${v.id}/trips?month=${month.key}`} className="hover:underline">
                          {v.plate ?? `${v.make} ${v.model}`}
                        </Link>
                      </>
                    )}
                    {trip.purpose && <span> · {trip.purpose}</span>}
                  </div>
                </div>
                <span className="font-semibold text-ink">{distance === null ? '—' : `${km(distance)} km`}</span>
              </li>
            )
          })}
        </ul>
      )}

      <a href={exportHref} download className="btn-secondary">{t('download')}</a>
      <p className="mt-3 text-xs text-ink-faint">{t('fleetFootnote')}</p>
    </div>
  )
}
