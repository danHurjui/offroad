import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import ShareImageButton from '@/components/ShareImageButton'

// RL-020 (off-road build card) / RL-021 (restoration transformation
// card) — one page, branching on projectType, since both are the same
// preview-then-share flow against a sibling PNG-generating route.
export default async function ShareCardPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isPro: true } })
  const isPro = Boolean(owner?.isPro)

  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const endpoint =
    vehicle.projectType === 'OFFROAD'
      ? `/api/vehicles/${vehicle.id}/card/build`
      : `/api/vehicles/${vehicle.id}/card/transformation`
  const title = vehicle.projectType === 'OFFROAD' ? 'Share build card' : 'Share transformation card'

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        ← Back to {config.screenTitle}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{title}</h1>

      {isPro ? (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={endpoint} alt={`${title} preview`} className="w-full" />
          </div>
          <ShareImageButton endpoint={endpoint} fallbackName={`RigLog_${vehicleName}`} />
        </div>
      ) : (
        <div className="card p-5">
          <p className="text-sm text-ink-muted">
            Upgrading to Pro is not available in this preview build — Pro will unlock a shareable, RigLog-branded
            image card for this build, ready to post to Instagram or Facebook groups.
          </p>
        </div>
      )}
    </div>
  )
}
