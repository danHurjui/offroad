import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { serializeTrailRun } from '@/lib/serialize'
import TrailThumbnail from '@/components/TrailThumbnail'
import { hasPro, PRO_SELECT } from '@/lib/pro'

// RL-027: trail log list — off-road mode, Pro-gated, owner-only.
export default async function TrailLogPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle || vehicle.projectType !== 'OFFROAD') notFound()

  const owner = await prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: { ...PRO_SELECT } })
  const isPro = hasPro(owner)

  const runs = isPro
    ? await prisma.trailRun.findMany({ where: { vehicleId: vehicle.id }, orderBy: { date: 'desc' } }).then((rs) => rs.map(serializeTrailRun))
    : []

  return (
    <div>
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        ← Back to dashboard
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Trail log</h1>
        {isPro && (
          <Link href={`/dashboard/vehicles/${vehicle.id}/trail-log/record`} className="btn-primary">
            Record a run
          </Link>
        )}
      </div>

      {!isPro ? (
        <div className="card note p-4 text-sm text-ink">
          Upgrade to Pro to record GPS trail runs for this build.
        </div>
      ) : runs.length === 0 ? (
        <div className="card p-10 text-center text-ink-muted">No trail runs recorded yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/dashboard/vehicles/${vehicle.id}/trail-log/${run.id}`}
              className="card block overflow-hidden hover:shadow-md"
            >
              <TrailThumbnail track={(run.trackGeoJson as { lat: number; lng: number }[] | null) ?? []} className="h-32 w-full" />
              <div className="p-3">
                <div className="font-medium text-ink">{run.name}</div>
                <div className="text-xs text-ink-faint">{new Date(run.date).toLocaleDateString('ro-RO')}</div>
                <div className="mt-1 flex gap-3 text-xs text-ink-muted">
                  {run.distanceKm != null && <span>{run.distanceKm} km</span>}
                  {run.durationMin != null && <span>{run.durationMin} min</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
