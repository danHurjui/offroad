import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { accessForRole } from '@/lib/access'
import { isDateRange, type DateRange } from '@/lib/analytics'
import { loadOwnershipInputs } from '@/lib/ownershipRecords'
import { fleetCost } from '@/lib/fleet'
import FleetCostChart from '@/components/FleetCostChart'
import { formatRon } from '@/lib/money'
import { pickSite, siteVehicleWhere } from '@/lib/sites'
import { loadSites } from '@/lib/siteRecords'
import SiteFilterSelect from '@/components/SiteFilterSelect'

const RANGES: DateRange[] = ['3m', '12m', 'all']
const money = (n: number) => formatRon(n, 0)

type Params = { params: { orgId: string }; searchParams: { range?: string; vehicle?: string; site?: string } }

// RL-039: what the fleet costs. Each vehicle's figure is its own cost-of-
// ownership report (the vehicle's costs page), added up; the gaps each
// report lists are counted and linked rather than estimated away. For
// OWNER and FLEET_MANAGER, like the compliance board; a 404 otherwise.
export default async function FleetCostsPage({ params, searchParams }: Params) {
  const t = await getTranslations('fleet.cost')
  const tf = await getTranslations('fleet')
  const ta = await getTranslations('analytics')
  const tc = await getTranslations('common')
  const to = await getTranslations('organizations')
  const tr = await getTranslations('fleetReport')
  const tp = await getTranslations('vehicleProfile')
  const session = await requireSessionOrRedirect()
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: params.orgId, userId: session.user.id } },
    include: { organization: { select: { id: true, name: true } } },
  })
  if (!membership || accessForRole(membership.role) !== 'owner') notFound()
  const org = membership.organization

  const range: DateRange = isDateRange(searchParams.range) ? searchParams.range : '12m'
  // #103: a site narrows the costs to its vehicles.
  const sites = await loadSites(org.id)
  const site = pickSite(sites, searchParams.site)
  const vehicles = await prisma.vehicle.findMany({ where: { organizationId: org.id, ...siteVehicleWhere(site) }, orderBy: { createdAt: 'asc' } })
  const selected = vehicles.find((v) => v.id === searchParams.vehicle) ?? null
  const shown = selected ? [selected] : vehicles
  const inputs = await loadOwnershipInputs(shown, new Date())
  const cost = fleetCost(shown.map((v) => inputs.get(v.id)!), range)
  const byId = new Map(shown.map((v) => [v.id, v]))
  const rows = [...cost.rows].sort((a, b) => b.runningTotal - a.runningTotal)

  const tiles: Array<[string, string]> = [
    [t('running'), money(cost.runningTotal)],
    [t('perVehicleMonth'), cost.perVehiclePerMonth === null ? '—' : money(cost.perVehiclePerMonth)],
    [t('total'), money(cost.total)],
    [t('withGaps'), String(cost.vehiclesWithGaps)],
  ]

  return (
    <div>
      <Link href={`/dashboard/organizations/${org.id}/fleet`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: tf('title') })}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-3 text-sm text-ink-muted">{t('intro')}</p>
      <Link href={`/dashboard/organizations/${org.id}/fleet/reports`} className="btn-secondary mb-6 inline-block">
        {tr('open')}
      </Link>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <div className="min-w-0">
          <label className="label" htmlFor="fleet-range">{t('range')}</label>
          <select id="fleet-range" name="range" className="input" defaultValue={range}>
            {RANGES.map((r) => (
              <option key={r} value={r}>{ta(`range.${r}`)}</option>
            ))}
          </select>
        </div>
        <SiteFilterSelect id="fleet-cost-site" sites={sites} selected={site} label={tf('filterSite')} allLabel={tf('allSites')} />
        {vehicles.length > 1 && (
          <div className="min-w-0">
            <label className="label" htmlFor="fleet-cost-vehicle">{tf('filterVehicle')}</label>
            <select id="fleet-cost-vehicle" name="vehicle" className="input" defaultValue={selected?.id ?? ''}>
              <option value="">{tf('allVehicles')}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate ? `${v.plate} · ` : ''}{v.year} {v.make} {v.model}</option>
              ))}
            </select>
          </div>
        )}
        <button type="submit" className="btn-secondary">{tf('apply')}</button>
      </form>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-xs uppercase tracking-wide text-ink-faint">{label}</div>
            <div className="mt-1 break-words text-xl font-bold text-ink">{value}</div>
          </div>
        ))}
      </div>

      <section className="card mb-6 p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-muted">{t('trend')}</h2>
        <FleetCostChart data={cost.trend} />
      </section>

      {rows.length === 0 ? (
        <p className="card p-4 text-sm text-ink-faint">{to('noVehicles')}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm">
            <caption className="sr-only">{t('caption')}</caption>
            <thead>
              <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-ink-faint">
                <th scope="col" className="p-3">{tf('vehicle')}</th>
                <th scope="col" className="p-3">{tp('fuelType')}</th>
                <th scope="col" className="p-3 text-right">{t('energy')}</th>
                <th scope="col" className="p-3 text-right">{t('running')}</th>
                <th scope="col" className="p-3 text-right">{t('perMonth')}</th>
                <th scope="col" className="p-3 text-right">{t('total')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {rows.map((row) => {
                const v = byId.get(row.vehicleId)!
                return (
                  <tr key={row.vehicleId}>
                    <th scope="row" className="p-3 text-left font-normal">
                      <Link href={`/dashboard/vehicles/${v.id}/costs?range=${range}`} className="font-medium text-ink hover:underline">
                        {v.plate ?? `${v.make} ${v.model}`}
                      </Link>
                      <div className="text-xs text-ink-muted">{v.year} {v.make} {v.model}</div>
                      {row.gaps > 0 && <span className="badge badge-warn mt-1">{t('gaps', { count: row.gaps })}</span>}
                    </th>
                    {/* The talon's fuel type, as the vehicle's own profile labels it. */}
                    <td className="p-3">{v.fuelType ? tp(`fuel.${v.fuelType}`) : <span className="text-ink-faint">{tp('notSet')}</span>}</td>
                    <td className="p-3 text-right">{money(row.energy)}</td>
                    <td className="p-3 text-right">{money(row.runningTotal)}</td>
                    <td className="p-3 text-right">{money(row.perMonth)}</td>
                    <td className="p-3 text-right">{money(row.total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-faint">{t('footnote')}</p>
    </div>
  )
}
