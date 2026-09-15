import type { Metadata } from 'next'
import { cache } from 'react'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG, labelFor } from '@/lib/projectType'
import { toNumberOrNull } from '@/lib/serialize'

// cache() dedupes this within one request — generateMetadata and the page
// component both need it, and without this they'd each hit the DB.
const findPublicVehicle = cache(async (username: string, slug: string) => {
  const owner = await prisma.user.findUnique({
    where: { username },
    select: { id: true, displayName: true, location: true },
  })
  if (!owner) return null

  const vehicle = await prisma.vehicle.findFirst({
    where: { ownerId: owner.id, slug, isPublic: true },
  })
  if (!vehicle) return null

  return { vehicle, owner }
})

export async function generateMetadata({
  params,
}: {
  params: { username: string; slug: string }
}): Promise<Metadata> {
  const data = await findPublicVehicle(params.username, params.slug)
  if (!data) return {}

  const { vehicle, owner } = data
  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const title = `${vehicle.year} ${vehicle.make} ${vehicle.model} — RigLog`
  const description = `${config.label} by ${owner.displayName} on RigLog.`
  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const ogImage = vehicle.coverPhotoUrl ? `${baseUrl}/api/uploads/${vehicle.coverPhotoUrl}` : undefined

  return {
    title,
    description,
    alternates: { canonical: `/builds/${params.username}/${params.slug}` },
    openGraph: {
      title,
      description,
      type: 'website',
      ...(ogImage ? { images: [{ url: ogImage, width: 1200, height: 630 }] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description },
  }
}

// RL-018: public, read-only project page — no session required. VIN is
// deliberately never shown here (unlike the owner's own PDF export):
// a public VIN is enough to pull a full vehicle history report on most
// lookup services, which isn't something an owner opts into just by
// flipping "make this project public".
export default async function PublicVehiclePage({
  params,
}: {
  params: { username: string; slug: string }
}) {
  const data = await findPublicVehicle(params.username, params.slug)
  if (!data) notFound()
  const { vehicle, owner } = data

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const completeStatus = config.completeStatus

  const tasks = await prisma.task.findMany({
    where: { vehicleId: vehicle.id, status: completeStatus },
    orderBy: { date: 'asc' },
    include: { photos: { orderBy: { createdAt: 'asc' } } },
  })

  const categoriesWithCompletion = new Set(tasks.map((t) => t.category))
  const progressPct = Math.round((categoriesWithCompletion.size / config.categories.length) * 100)
  const totalSpent = tasks.reduce((sum, t) => {
    const cost =
      t.workType === 'WORKSHOP'
        ? (toNumberOrNull(t.partsCostRon) ?? 0) + (toNumberOrNull(t.labourCostRon) ?? 0)
        : toNumberOrNull(t.costRon) ?? 0
    return sum + cost
  }, 0)

  const grouped = new Map<string, typeof tasks>()
  for (const task of tasks) {
    if (!grouped.has(task.category)) grouped.set(task.category, [])
    grouped.get(task.category)!.push(task)
  }
  const orderedGroups = config.categories
    .map((c) => [c, grouped.get(c.value) ?? []] as const)
    .filter(([, categoryTasks]) => categoryTasks.length > 0)

  return (
    <div className="min-h-screen bg-surface-muted">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="card overflow-hidden">
          {vehicle.coverPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/uploads/${vehicle.coverPhotoUrl}`}
              alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              className="h-56 w-full object-cover"
            />
          ) : (
            <div className="flex h-56 items-center justify-center bg-surface-subtle text-sm text-ink-faint">
              No cover photo
            </div>
          )}
          <div className="p-6">
            <span className="badge bg-brand-100 text-brand-700">{config.label}</span>
            <h1 className="mt-2 text-2xl font-bold text-ink">
              {vehicle.year} {vehicle.make} {vehicle.model}
              {vehicle.generation ? ` (${vehicle.generation})` : ''}
            </h1>
            <p className="text-sm text-ink-muted">
              by {owner.displayName}
              {owner.location ? ` · ${owner.location}` : ''}
            </p>
            {vehicle.engine && <p className="mt-1 text-sm text-ink-muted">{vehicle.engine}</p>}

            <div className="mt-4 flex flex-wrap gap-4">
              <div>
                <div className="text-xs text-ink-faint">{config.progressLabel}</div>
                <div className="text-lg font-semibold text-ink">{progressPct}%</div>
              </div>
              {!vehicle.hidePublicCost && (
                <div>
                  <div className="text-xs text-ink-faint">Total spent</div>
                  <div className="text-lg font-semibold text-ink">{totalSpent.toLocaleString('ro-RO')} RON</div>
                </div>
              )}
              <div>
                <div className="text-xs text-ink-faint">Completed tasks</div>
                <div className="text-lg font-semibold text-ink">{tasks.length}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          {orderedGroups.length === 0 && (
            <p className="text-center text-sm text-ink-faint">No completed work logged yet.</p>
          )}
          {orderedGroups.map(([category, categoryTasks]) => (
            <div key={category.value}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
                {labelFor(config.categories, category.value)}
              </h2>
              <div className="card divide-y divide-surface-border">
                {categoryTasks.map((task) => (
                  <div key={task.id} className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-ink">
                        {task.name}
                        {task.brand && <span className="text-ink-muted"> — {task.brand}</span>}
                      </div>
                      <div className="text-xs text-ink-faint">{new Date(task.date).toLocaleDateString('ro-RO')}</div>
                    </div>
                    {task.photos.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {task.photos.map((photo) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={photo.id}
                            src={`/api/uploads/${photo.url}`}
                            alt={photo.caption ?? task.name}
                            className="h-20 w-20 rounded object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-ink-faint">
          Documented with <span className="font-semibold">RigLog</span>
        </p>
      </div>
    </div>
  )
}
