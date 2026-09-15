import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG, labelFor } from '@/lib/projectType'
import { toNumberOrNull } from '@/lib/serialize'
import VehicleCoverImg from '@/components/VehicleCoverImg'

// RL-003: project dashboard — build overview screen.
export default async function VehicleDashboardPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const isOwner = vehicle.ownerId === session.user.id
  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const completeStatus = config.statusTags[config.statusTags.length - 1].value

  const [tasks, foundState] = await Promise.all([
    prisma.task.findMany({ where: { vehicleId: vehicle.id }, orderBy: { updatedAt: 'desc' } }),
    vehicle.projectType === 'RESTORATION'
      ? prisma.foundState.findUnique({ where: { vehicleId: vehicle.id } })
      : Promise.resolve(null),
  ])

  const categoriesWithCompletion = new Set(
    tasks.filter((t) => t.status === completeStatus).map((t) => t.category)
  )
  const progressPct = Math.round((categoriesWithCompletion.size / config.categories.length) * 100)

  const totalSpent = tasks.reduce((sum, t) => {
    const cost =
      t.workType === 'WORKSHOP'
        ? (toNumberOrNull(t.partsCostRon) ?? 0) + (toNumberOrNull(t.labourCostRon) ?? 0)
        : toNumberOrNull(t.costRon) ?? 0
    return sum + cost
  }, 0)
  const completedCount = tasks.filter((t) => t.status === completeStatus).length
  const plannedCount = tasks.length - completedCount

  const grouped = new Map<string, typeof tasks>()
  for (const category of config.categories) grouped.set(category.value, [])
  for (const task of tasks) {
    if (!grouped.has(task.category)) grouped.set(task.category, [])
    grouped.get(task.category)!.push(task)
  }
  const sortedGroups = Array.from(grouped.entries()).sort((a, b) => {
    const aLatest = a[1][0]?.updatedAt?.getTime() ?? 0
    const bLatest = b[1][0]?.updatedAt?.getTime() ?? 0
    return bLatest - aLatest
  })

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="badge bg-brand-100 text-brand-700">{config.label}</span>
          <h1 className="mt-2 text-2xl font-bold text-ink">{config.screenTitle}</h1>
          <p className="text-ink-muted">
            {vehicle.year} {vehicle.make} {vehicle.model}
            {vehicle.generation ? ` (${vehicle.generation})` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/vehicles/${vehicle.id}/photos`} className="btn-secondary">
            Photos
          </Link>
          {vehicle.projectType === 'RESTORATION' && (
            <Link href={`/dashboard/vehicles/${vehicle.id}/found-state`} className="btn-secondary">
              Found state
            </Link>
          )}
          {isOwner && (
            <Link href={`/dashboard/vehicles/${vehicle.id}/edit`} className="btn-secondary">
              Settings
            </Link>
          )}
          <Link href={`/dashboard/vehicles/${vehicle.id}/tasks/new`} className="btn-primary">
            {config.addTaskCta}
          </Link>
        </div>
      </div>

      {vehicle.coverPhotoUrl && (
        <div className="card mb-6 overflow-hidden">
          <VehicleCoverImg url={vehicle.coverPhotoUrl} alt={`${vehicle.make} ${vehicle.model}`} />
        </div>
      )}

      {vehicle.projectType === 'RESTORATION' && !foundState && (
        <div className="card mb-6 flex items-center justify-between gap-4 border-brand-200 bg-brand-50 p-4">
          <p className="text-sm text-ink">
            Complete the found state intake to document this car&apos;s starting point.
          </p>
          <Link href={`/dashboard/vehicles/${vehicle.id}/found-state`} className="btn-primary shrink-0">
            Complete intake
          </Link>
        </div>
      )}

      <div className="card mb-6 p-5">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-muted">{config.progressLabel}</span>
          <span className="text-sm font-semibold text-ink">{progressPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-subtle">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="Total spent" value={`${totalSpent.toLocaleString('ro-RO')} RON`} />
        <StatCard label="Completed" value={String(completedCount)} />
        <StatCard label="Planned" value={String(plannedCount)} />
      </div>

      <div className="space-y-6">
        {sortedGroups.map(([categoryValue, categoryTasks]) => (
          <div key={categoryValue}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              {labelFor(config.categories, categoryValue)}
            </h2>
            {categoryTasks.length === 0 ? (
              <Link
                href={`/dashboard/vehicles/${vehicle.id}/tasks/new?category=${categoryValue}`}
                className="card block p-4 text-sm text-ink-faint hover:text-brand-600"
              >
                {config.addTaskCta} in this category
              </Link>
            ) : (
              <div className="card divide-y divide-surface-border">
                {categoryTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/dashboard/vehicles/${vehicle.id}/tasks/${task.id}`}
                    className="flex items-center justify-between gap-3 p-4 hover:bg-surface-muted"
                  >
                    <div className="flex items-center gap-2">
                      {task.workType === 'WORKSHOP' && <span title="Workshop task">🔧</span>}
                      <div>
                        <div className="font-medium text-ink">{task.name}</div>
                        <div className="text-xs text-ink-faint">
                          {new Date(task.date).toLocaleDateString('ro-RO')}
                        </div>
                      </div>
                    </div>
                    <span className="badge bg-surface-subtle text-ink-muted">
                      {labelFor(config.statusTags, task.status)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="text-lg font-semibold text-ink">{value}</div>
    </div>
  )
}
