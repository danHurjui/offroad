import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { labelFor } from '@/lib/projectType'
import { getVocabulary } from '@/lib/vocabulary'
import TrailThumbnail from '@/components/TrailThumbnail'

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

  const t = await getTranslations('photos')
  const tc = await getTranslations('common')
  const config = await getVocabulary(vehicle.projectType)
  const order = searchParams.order === 'oldest' ? 'asc' : 'desc'
  const isOwner = vehicle.access === 'owner'
  const noFiltersActive = !searchParams.photoType && !searchParams.category

  const [photos, trailRuns] = await Promise.all([
    prisma.taskPhoto.findMany({
      where: {
        vehicleId: vehicle.id,
        ...(searchParams.photoType ? { photoType: searchParams.photoType } : {}),
        ...(searchParams.category ? { task: { category: searchParams.category } } : {}),
      },
      orderBy: { createdAt: order },
      include: { task: { select: { id: true, name: true, category: true } } },
    }),
    // RL-027: trail runs surface here too, but only alongside the
    // unfiltered view — they have no photoType/category of their own to
    // filter by, so mixing them into a filtered result would be
    // misleading about what "All types"/"All categories" actually means.
    isOwner && vehicle.projectType === 'OFFROAD' && noFiltersActive
      ? prisma.trailRun.findMany({ where: { vehicleId: vehicle.id }, orderBy: { date: order } })
      : Promise.resolve([]),
  ])

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
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-4 text-2xl font-bold text-ink">{t('title')}</h1>

      <div className="scroll-row mb-4">
        <Link href={filterUrl({ photoType: undefined })} className={`chip ${!searchParams.photoType ? 'chip-on' : ''}`} aria-current={!searchParams.photoType ? 'true' : undefined}>
          {t('allTypes')}
        </Link>
        {config.photoTypes.map((t) => (
          <Link key={t.value} href={filterUrl({ photoType: t.value })} className={`chip ${searchParams.photoType === t.value ? 'chip-on' : ''}`} aria-current={searchParams.photoType === t.value ? 'true' : undefined}>
            {t.label}
          </Link>
        ))}
      </div>

      <div className="scroll-row mb-4">
        <Link href={filterUrl({ category: undefined })} className={`chip ${!searchParams.category ? 'chip-on' : ''}`} aria-current={!searchParams.category ? 'true' : undefined}>
          {t('allCategories')}
        </Link>
        {config.categories.map((c) => (
          <Link key={c.value} href={filterUrl({ category: c.value })} className={`chip ${searchParams.category === c.value ? 'chip-on' : ''}`} aria-current={searchParams.category === c.value ? 'true' : undefined}>
            {c.label}
          </Link>
        ))}
        <Link href={filterUrl({ order: order === 'asc' ? undefined : 'oldest' })} className="chip">
          {order === 'asc' ? t('newestFirst') : t('oldestFirst')}
        </Link>
      </div>

      {photos.length === 0 ? (
        noFiltersActive ? (
          /* Photos are uploaded on a job, never here, so the useful answer
             to an empty timeline is the way to a job. */
          <div className="card flex flex-col items-center gap-3 p-10 text-center">
            <p className="max-w-prose text-ink-muted">{t('empty')}</p>
            <Link href={`/dashboard/vehicles/${vehicle.id}/tasks/new`} className="btn-primary">
              {config.addTaskCta}
            </Link>
          </div>
        ) : (
          <div className="card p-10 text-center text-ink-muted">{t('emptyFiltered')}</div>
        )
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

      {trailRuns.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('trailRunsHeading')}</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {trailRuns.map((run) => (
              <Link
                key={run.id}
                href={`/dashboard/vehicles/${vehicle.id}/trail-log/${run.id}`}
                className="group relative block aspect-square overflow-hidden rounded-lg bg-surface-subtle"
              >
                <TrailThumbnail track={(run.trackGeoJson as { lat: number; lng: number }[] | null) ?? []} className="h-full w-full" />
                <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5 text-[11px] text-white">
                  {run.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
