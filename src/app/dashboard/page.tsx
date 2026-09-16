import Link from 'next/link'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG, type ProjectType } from '@/lib/projectType'
import VehicleCoverImg from '@/components/VehicleCoverImg'

export default async function DashboardPage() {
  const session = await requireSessionOrRedirect()

  const [owned, collaborating, user] = await Promise.all([
    prisma.vehicle.findMany({ where: { ownerId: session.user.id }, orderBy: { updatedAt: 'desc' } }),
    prisma.vehicle.findMany({
      where: { collaborators: { some: { collaboratorUserId: session.user.id, status: 'ACTIVE' } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { isPro: true } }),
  ])

  const atFreeLimit = !user?.isPro && owned.length >= 1

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Your vehicles</h1>
        {atFreeLimit ? (
          <span className="badge bg-surface-subtle text-ink-muted" title="Free tier is limited to 1 vehicle">
            Free plan — 1/1 vehicles
          </span>
        ) : (
          <Link href="/dashboard/vehicles/new" className="btn-primary">
            + Add vehicle
          </Link>
        )}
      </div>

      {owned.length === 0 && collaborating.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-ink-muted">No vehicles yet — log your first build or restoration.</p>
          <Link href="/dashboard/vehicles/new" className="btn-primary">
            + Add vehicle
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {owned.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
          {collaborating.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} collaborator />
          ))}
        </div>
      )}
    </div>
  )
}

function VehicleCard({
  vehicle,
  collaborator,
}: {
  vehicle: { id: string; make: string; model: string; year: number; projectType: ProjectType; coverPhotoUrl: string | null }
  collaborator?: boolean
}) {
  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  return (
    <Link href={`/dashboard/vehicles/${vehicle.id}`} className="card block overflow-hidden hover:shadow-panel">
      <VehicleCoverImg url={vehicle.coverPhotoUrl} alt={`${vehicle.make} ${vehicle.model}`} />
      <div className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="badge bg-brand-100 text-brand-700">{config.label}</span>
          {collaborator && <span className="badge bg-surface-subtle text-ink-muted">Collaborator</span>}
        </div>
        <h2 className="font-semibold text-ink">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </h2>
      </div>
    </Link>
  )
}
