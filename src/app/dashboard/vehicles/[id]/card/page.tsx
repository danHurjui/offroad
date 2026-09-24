import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import ShareImageButton from '@/components/ShareImageButton'
import TransformationCardPicker from '@/components/TransformationCardPicker'
import { vehicleHasPro } from '@/lib/entitlement'

// RL-020 (off-road build card) / RL-021 (restoration transformation
// card) — one page, branching on projectType, since both are the same
// preview-then-share flow against a sibling PNG-generating route.
// Restoration additionally lets the owner pick which before/after photos
// appear (see TransformationCardPicker) — off-road doesn't need that,
// it auto-picks the 4 most recent completed mods. A daily driver has
// neither card: both are showcase pieces for a project, and a repair log
// isn't one, so the page 404s (the dashboard hides the link too).
export default async function ShareCardPage({ params }: { params: { id: string } }) {
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()
  if (vehicle.projectType === 'DAILY_DRIVER') notFound()

  const config = await getVocabulary(vehicle.projectType)
  const isPro = await vehicleHasPro(vehicle)

  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const isOffroad = vehicle.projectType === 'OFFROAD'
  const title = isOffroad ? 'Share build card' : 'Share transformation card'

  let beforeOptions: { id: string; label: string }[] = []
  let afterOptions: { id: string; label: string }[] = []
  if (isPro && !isOffroad) {
    const [foundState, tasks] = await Promise.all([
      prisma.foundState.findUnique({
        where: { vehicleId: vehicle.id },
        include: { photos: { orderBy: { createdAt: 'asc' } } },
      }),
      prisma.task.findMany({
        where: { vehicleId: vehicle.id },
        select: { name: true, photos: { select: { id: true, createdAt: true }, orderBy: { createdAt: 'desc' } } },
      }),
    ])
    beforeOptions = (foundState?.photos ?? []).map((p, i) => ({ id: p.id, label: p.caption ?? `Found state photo ${i + 1}` }))
    afterOptions = tasks
      .flatMap((t) => t.photos.map((p) => ({ id: p.id, label: t.name, createdAt: p.createdAt })))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ id, label }) => ({ id, label }))
  }

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{title}</h1>

      {!isPro ? (
        <div className="card p-5">
          <p className="text-sm text-ink-muted">
            Upgrading to Pro is not available in this preview build — Pro will unlock a shareable, RigLog-branded
            image card for this build, ready to post to Instagram or Facebook groups.
          </p>
        </div>
      ) : isOffroad ? (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/vehicles/${vehicle.id}/card/build`} alt={`${title} preview`} className="w-full" />
          </div>
          <ShareImageButton endpoint={`/api/vehicles/${vehicle.id}/card/build`} fallbackName={`RigLog_${vehicleName}`} />
        </div>
      ) : (
        <TransformationCardPicker
          vehicleId={vehicle.id}
          vehicleName={vehicleName}
          beforeOptions={beforeOptions}
          afterOptions={afterOptions}
        />
      )}
    </div>
  )
}
