import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { toNumberOrNull } from '@/lib/serialize'
import {
  isDateRange,
  rangeCutoff,
  spendByVehicle,
  summarizeCosts,
  type DateRange,
} from '@/lib/analytics'
import { hasPro, PRO_SELECT } from '@/lib/pro'

const RANGES: DateRange[] = ['3m', '12m', 'all']

/**
 * Spend across the whole garage.
 *
 * Owned vehicles only. A collaboration is somebody else's garage, and its
 * costs may be hidden from this viewer anyway
 * (Vehicle.hideCostsFromCollaborators) — rolling them into a personal
 * total would leak the number the owner chose to hide.
 *
 * The free/Pro split is the per-vehicle page's, unchanged: a total, and
 * then the breakdown behind Pro. Deliberately not widened — the per-vehicle
 * page gives free "basic total only", and a per-vehicle table here would
 * quietly be more than that.
 */
export default async function GarageAnalyticsPage({ searchParams }: { searchParams: { range?: string } }) {
  const session = await requireSessionOrRedirect()
  const t = await getTranslations('analytics')
  const tc = await getTranslations('common')
  const td = await getTranslations('dashboard')

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT } })
  const isPro = hasPro(user)

  const range: DateRange = isDateRange(searchParams.range) ? searchParams.range : 'all'
  const cutoff = rangeCutoff(range)

  const vehicles = await prisma.vehicle.findMany({
    // Personal vehicles only: company spend belongs to the organisation.
    where: { ownerId: session.user.id, organizationId: null },
    select: { id: true, make: true, model: true, year: true },
    orderBy: { createdAt: 'asc' },
  })

  const tasks = await prisma.task.findMany({
    where: {
      vehicle: { ownerId: session.user.id, organizationId: null },
      ...(cutoff ? { date: { gte: cutoff } } : {}),
    },
    select: {
      name: true,
      vehicleId: true,
      category: true,
      date: true,
      workType: true,
      costRon: true,
      partsCostRon: true,
      labourCostRon: true,
    },
  })
  // Pitfall #5: Decimal, not number — arithmetic on the raw value is wrong
  // and JSON would serialise it as a string.
  const costTasks = tasks.map((task) => ({
    ...task,
    costRon: toNumberOrNull(task.costRon),
    partsCostRon: toNumberOrNull(task.partsCostRon),
    labourCostRon: toNumberOrNull(task.labourCostRon),
  }))

  const summary = summarizeCosts(costTasks)
  const perVehicle = spendByVehicle(
    vehicles.map((v) => ({ id: v.id, label: `${v.year} ${v.make} ${v.model}` })),
    costTasks
  )

  return (
    <div>
      <Link href="/dashboard" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: td('title') })}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('garageTitle')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('garageSubtitle')}</p>

      {vehicles.length === 0 ? (
        <div className="card p-10 text-center text-ink-muted">{t('garageEmpty')}</div>
      ) : !isPro ? (
        <>
          <div className="card mb-4 p-4">
            <div className="text-xs text-ink-faint">{t('garageTotal')}</div>
            <div className="text-2xl font-semibold text-ink">{summary.totalSpent.toLocaleString('ro-RO')} RON</div>
            <div className="mt-1 text-xs text-ink-faint">{t('vehicleCount', { count: vehicles.length })}</div>
          </div>
          <div className="card note p-4 text-sm text-ink">{t('upgradePrompt')}</div>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            {RANGES.map((r) => (
              <Link
                key={r}
                href={`/dashboard/analytics?range=${r}`}
                className={`badge ${range === r ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink-muted'}`}
              >
                {t(`range.${r}`)}
              </Link>
            ))}
          </div>

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <div className="text-xs text-ink-faint">{t('garageTotal')}</div>
              <div className="text-lg font-semibold text-ink">{summary.totalSpent.toLocaleString('ro-RO')} RON</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-ink-faint">{t('averagePerMonth')}</div>
              <div className="text-lg font-semibold text-ink">
                {Math.round(summary.avgPerMonth).toLocaleString('ro-RO')} RON
              </div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-ink-faint">{t('mostExpensive')}</div>
              <div className="truncate text-lg font-semibold text-ink" title={summary.mostExpensiveTask?.name}>
                {summary.mostExpensiveTask
                  ? `${summary.mostExpensiveTask.name} — ${summary.mostExpensiveTask.cost.toLocaleString('ro-RO')} RON`
                  : '—'}
              </div>
            </div>
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('perVehicle')}</h2>
          <div className="card divide-y divide-surface-border">
            {perVehicle.map((row) => (
              <Link
                key={row.vehicleId}
                href={`/dashboard/vehicles/${row.vehicleId}/analytics`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-surface-muted"
              >
                <span className="min-w-0 truncate text-ink">{row.label}</span>
                <span className="shrink-0 font-semibold text-ink">{row.total.toLocaleString('ro-RO')} RON</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
