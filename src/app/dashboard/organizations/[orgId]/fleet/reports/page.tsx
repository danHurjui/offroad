import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { accessForRole } from '@/lib/access'
import { dayKey, defaultReportPeriod, parseReportPeriod, REPORT_MAX_DAYS } from '@/lib/fleetReport'
import FormError from '@/components/FormError'
import { pickSite, siteVehicleWhere } from '@/lib/sites'
import { loadSites } from '@/lib/siteRecords'
import SiteFilterSelect from '@/components/SiteFilterSelect'

type Params = { params: { orgId: string }; searchParams: { from?: string; to?: string; vehicle?: string; site?: string } }

// RL-041: the fleet's files for an accountant — the jobs and the costs as
// CSV, the period's summary as PDF. The form is a GET to this page, so it
// works without script; the routes check the period and the vehicle again
// themselves, since nothing here stops a hand-edited URL.
export default async function FleetReportsPage({ params, searchParams }: Params) {
  const t = await getTranslations('fleetReport')
  const tf = await getTranslations('fleet')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: params.orgId, userId: session.user.id } },
    include: { organization: { select: { id: true, name: true } } },
  })
  if (!membership || accessForRole(membership.role) !== 'owner') notFound()
  const org = membership.organization

  // #103: the routes narrow to the site again, and 404 one that is not this organisation's.
  const sites = await loadSites(org.id)
  const site = pickSite(sites, searchParams.site)
  const vehicles = await prisma.vehicle.findMany({
    where: { organizationId: org.id, ...siteVehicleWhere(site) },
    orderBy: { createdAt: 'asc' },
    select: { id: true, year: true, make: true, model: true, plate: true },
  })
  const selected = vehicles.find((v) => v.id === searchParams.vehicle) ?? null

  const asked = searchParams.from !== undefined || searchParams.to !== undefined
  const fallback = defaultReportPeriod()
  const parsed = asked ? parseReportPeriod(searchParams.from, searchParams.to) : ({ ok: true, period: fallback } as const)
  const from = asked ? searchParams.from ?? '' : dayKey(fallback.from)
  const to = asked ? searchParams.to ?? '' : dayKey(fallback.to)

  const query = new URLSearchParams({
    from,
    to,
    ...(site ? { site: site.id } : {}),
    ...(selected ? { vehicle: selected.id } : {}),
  }).toString()
  const base = `/api/organizations/${org.id}/reports`
  const files = [
    { href: `${base}/summary?${query}`, title: t('files.summary'), description: t('files.summaryHelp') },
    { href: `${base}/jobs?${query}`, title: t('files.jobs'), description: t('files.jobsHelp') },
    { href: `${base}/costs?${query}`, title: t('files.costs'), description: t('files.costsHelp') },
  ]

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/organizations/${org.id}/fleet`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: tf('title') })}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('intro')}</p>

      <form method="get" className="card mb-6 space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label className="label" htmlFor="report-from">{t('from')}</label>
            <input
              id="report-from"
              name="from"
              type="date"
              className="input"
              defaultValue={from}
              required
              aria-describedby={parsed.ok ? undefined : 'report-period-error'}
            />
          </div>
          <div className="min-w-0">
            <label className="label" htmlFor="report-to">{t('to')}</label>
            <input
              id="report-to"
              name="to"
              type="date"
              className="input"
              defaultValue={to}
              required
              aria-describedby={parsed.ok ? undefined : 'report-period-error'}
            />
          </div>
        </div>
        <SiteFilterSelect id="report-site" sites={sites} selected={site} label={tf('filterSite')} allLabel={tf('allSites')} />
        {vehicles.length > 1 && (
          <div className="min-w-0">
            <label className="label" htmlFor="report-vehicle">{tf('filterVehicle')}</label>
            <select id="report-vehicle" name="vehicle" className="input" defaultValue={selected?.id ?? ''}>
              <option value="">{tf('allVehicles')}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plate ? `${v.plate} · ` : ''}{v.year} {v.make} {v.model}</option>
              ))}
            </select>
          </div>
        )}
        <p className="text-xs text-ink-faint">{t('limit', { days: REPORT_MAX_DAYS })}</p>
        <FormError id="report-period-error">{parsed.ok ? null : t(`error.${parsed.code}`, { days: REPORT_MAX_DAYS })}</FormError>
        <button type="submit" className="btn-secondary">{tf('apply')}</button>
      </form>

      {parsed.ok && (
        <ul className="space-y-3">
          {files.map((file) => (
            <li key={file.href} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="font-medium text-ink">{file.title}</div>
                <p className="text-sm text-ink-muted">{file.description}</p>
              </div>
              <a href={file.href} download className="btn-primary">{t('download')}</a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-ink-faint">{t('footnote')}</p>
    </div>
  )
}
