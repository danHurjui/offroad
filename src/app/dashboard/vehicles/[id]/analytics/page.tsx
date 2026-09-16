import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG, labelFor } from '@/lib/projectType'
import { toNumberOrNull } from '@/lib/serialize'
import {
  isDateRange,
  rangeCutoff,
  spendByCategory,
  cumulativeSpendByMonth,
  summarizeCosts,
  type DateRange,
} from '@/lib/analytics'
import CostAnalyticsCharts from '@/components/CostAnalyticsCharts'
import { hasPro, PRO_SELECT } from '@/lib/pro'

const RANGE_LABELS: Record<DateRange, string> = { '3m': 'Last 3 months', '12m': 'Last 12 months', all: 'All time' }

// RL-015: cost analytics dashboard. Free tier gets the total-spent card
// only; Pro gets the full breakdown (charts, averages, most expensive
// task, date range filter) — matches the Phase 2 feature matrix in the
// analysis doc ("Cost analytics — charts and trends: Basic total only" vs
// "Full dashboard").
export default async function CostAnalyticsPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { range?: string }
}) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const isOwner = vehicle.ownerId === session.user.id
  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  // Pro is the vehicle owner's subscription, not the viewer's — a
  // collaborator's own isPro is irrelevant to what they see here.
  const owner = await prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: { ...PRO_SELECT } })
  const isPro = hasPro(owner)

  if (!isOwner && vehicle.hideCostsFromCollaborators) {
    return (
      <div>
        <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
          ← Back to {config.screenTitle}
        </Link>
        <h1 className="mb-6 text-2xl font-bold text-ink">Cost analytics</h1>
        <div className="card p-4 text-sm text-ink-muted">The owner has hidden cost totals from collaborators.</div>
      </div>
    )
  }

  const range: DateRange = isDateRange(searchParams.range) ? searchParams.range : 'all'
  const cutoff = rangeCutoff(range)

  const tasks = await prisma.task.findMany({
    where: { vehicleId: vehicle.id, ...(cutoff ? { date: { gte: cutoff } } : {}) },
    select: { name: true, category: true, date: true, workType: true, costRon: true, partsCostRon: true, labourCostRon: true },
  })
  const costTasks = tasks.map((t) => ({
    ...t,
    costRon: toNumberOrNull(t.costRon),
    partsCostRon: toNumberOrNull(t.partsCostRon),
    labourCostRon: toNumberOrNull(t.labourCostRon),
  }))

  const summary = summarizeCosts(costTasks)

  return (
    <div>
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        ← Back to {config.screenTitle}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">Cost analytics</h1>

      {!isPro ? (
        <>
          <div className="card mb-4 p-4">
            <div className="text-xs text-ink-faint">Total spent</div>
            <div className="text-2xl font-semibold text-ink">{summary.totalSpent.toLocaleString('ro-RO')} RON</div>
          </div>
          <div className="card note p-4 text-sm text-ink">
            Upgrade to Pro for charts, monthly trends, date filters, and the most expensive task breakdown.
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            {(Object.keys(RANGE_LABELS) as DateRange[]).map((r) => (
              <Link
                key={r}
                href={`/dashboard/vehicles/${vehicle.id}/analytics?range=${r}`}
                className={`badge ${range === r ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink-muted'}`}
              >
                {RANGE_LABELS[r]}
              </Link>
            ))}
          </div>

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <div className="text-xs text-ink-faint">Total spent</div>
              <div className="text-lg font-semibold text-ink">{summary.totalSpent.toLocaleString('ro-RO')} RON</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-ink-faint">Average per month</div>
              <div className="text-lg font-semibold text-ink">{Math.round(summary.avgPerMonth).toLocaleString('ro-RO')} RON</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-ink-faint">Most expensive task</div>
              <div className="truncate text-lg font-semibold text-ink" title={summary.mostExpensiveTask?.name}>
                {summary.mostExpensiveTask
                  ? `${summary.mostExpensiveTask.name} (${summary.mostExpensiveTask.cost.toLocaleString('ro-RO')} RON)`
                  : '—'}
              </div>
            </div>
          </div>

          <CostAnalyticsCharts
            categoryData={spendByCategory(costTasks).map((c) => ({ label: labelFor(config.categories, c.category), total: c.total }))}
            monthlyData={cumulativeSpendByMonth(costTasks)}
          />
        </>
      )}
    </div>
  )
}
