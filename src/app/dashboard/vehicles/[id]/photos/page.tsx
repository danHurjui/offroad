import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG, labelFor } from '@/lib/projectType'

// RL-007: photo timeline — full project visual log, filterable.
export default async function PhotosTimelinePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { photoType?: string; category?: string; order?: string }
}) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const order = searchParams.order === 'oldest' ? 'asc' : 'desc'

  const photos = await prisma.taskPhoto.findMany({
    where: {
      vehicleId: vehicle.id,
      ...(searchParams.photoType ? { photoType: searchParams.photoType } : {}),
      ...(searchParams.category ? { task: { category: searchParams.category } } : {}),
    },
    orderBy: { createdAt: order },
    include: { task: { select: { id: true, name: true, category: true } } },
  })

  const vehicleId = vehicle.id
  function filterUrl(overrides: Record<string, string | undefined>) {
    const next = new URLSearchParams({
      ...(searchParams.photoType ? { photoType: searchParams.photoType } : {}),
      ...(searchParams.category ? { category: searchParams.category } : {}),
      ...(searchParams.order ? { order: searchParams.order } : {}),
      ...overrides,
    })
    for (const [key, value] of Array.from(next.entries())) if (!value) next.delete(key)
    const qs = next.toString()
    return `/dashboard/vehicles/${vehicleId}/photos${qs ? `?${qs}` : ''}`
  }

  return (
    <div>
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        ← Back to {config.screenTitle}
      </Link>
      <h1 className="mb-4 text-2xl font-bold text-ink">Photos</h1>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link href={filterUrl({ photoType: undefined })} className={`badge ${!searchParams.photoType ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink-muted'}`}>
          All types
        </Link>
        {config.photoTypes.map((t) => (
          <Link key={t.value} href={filterUrl({ photoType: t.value })} className={`badge ${searchParams.photoType === t.value ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink-muted'}`}>
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2 text-sm">
        <Link href={filterUrl({ category: undefined })} className={`badge ${!searchParams.category ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink-muted'}`}>
          All categories
        </Link>
        {config.categories.map((c) => (
          <Link key={c.value} href={filterUrl({ category: c.value })} className={`badge ${searchParams.category === c.value ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink-muted'}`}>
            {c.label}
          </Link>
        ))}
        <Link href={filterUrl({ order: order === 'asc' ? undefined : 'oldest' })} className="badge bg-surface-subtle text-ink-muted">
          {order === 'asc' ? 'Newest first' : 'Oldest first'}
        </Link>
      </div>

      {photos.length === 0 ? (
        <div className="card p-10 text-center text-ink-muted">No photos yet — add photos from a task.</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <Link
              key={photo.id}
              href={`/dashboard/vehicles/${vehicle.id}/tasks/${photo.task.id}`}
              className="group relative block aspect-square overflow-hidden rounded-lg bg-surface-subtle"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/uploads/${photo.url}`} alt={photo.caption ?? ''} className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] text-white">
                {photo.task.name} · {labelFor(config.photoTypes, photo.photoType)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
