import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { toNumberOrNull } from '@/lib/serialize'
import TrailRunMapView from '@/components/TrailRunMapView'
import DeleteTrailRunButton from '@/components/DeleteTrailRunButton'

export default async function TrailRunDetailPage({ params }: { params: { id: string; runId: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle || vehicle.projectType !== 'OFFROAD') notFound()

  const run = await prisma.trailRun.findUnique({
    where: { id: params.runId },
    include: { waypoints: { orderBy: { recordedAt: 'asc' } } },
  })
  if (!run || run.vehicleId !== vehicle.id) notFound()

  const track = (run.trackGeoJson as { lat: number; lng: number }[] | null) ?? []

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}/trail-log`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        ← Back to trail log
      </Link>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{run.name}</h1>
          <p className="text-sm text-ink-faint">
            {new Date(run.date).toLocaleDateString('ro-RO')}
            {run.location ? ` · ${run.location}` : ''}
          </p>
        </div>
        <DeleteTrailRunButton vehicleId={vehicle.id} runId={run.id} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 text-sm">
        <div className="card p-3">
          <div className="text-xs text-ink-faint">Distance</div>
          <div className="font-semibold text-ink">{toNumberOrNull(run.distanceKm) ?? '—'} km</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-ink-faint">Duration</div>
          <div className="font-semibold text-ink">{run.durationMin ?? '—'} min</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-ink-faint">Elevation gain</div>
          <div className="font-semibold text-ink">{run.elevationGainM != null ? `${run.elevationGainM} m` : '—'}</div>
        </div>
      </div>

      {track.length > 1 && (
        <div className="card mb-6 overflow-hidden">
          <TrailRunMapView track={track} waypoints={run.waypoints.map((w) => ({ id: w.id, lat: w.lat, lng: w.lng, note: w.note }))} />
        </div>
      )}

      {run.notes && <p className="mb-6 text-sm text-ink-muted">{run.notes}</p>}

      {run.waypoints.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">Waypoints</h2>
          <div className="card divide-y divide-surface-border">
            {run.waypoints.map((w) => (
              <div key={w.id} className="flex items-center gap-3 p-4">
                {w.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/uploads/${w.photoUrl}`} alt={w.note ?? ''} className="h-16 w-16 shrink-0 rounded object-cover" />
                )}
                <div>
                  <div className="text-sm text-ink">{w.note || 'Waypoint'}</div>
                  <div className="text-xs text-ink-faint">{new Date(w.recordedAt).toLocaleTimeString('ro-RO')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
