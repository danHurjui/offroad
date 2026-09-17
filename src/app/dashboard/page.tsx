import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { type ProjectType } from '@/lib/projectType'
import { getVocabulary } from '@/lib/vocabulary'
import VehicleCoverImg from '@/components/VehicleCoverImg'
import { hasPro, PRO_SELECT } from '@/lib/pro'

export default async function DashboardPage() {
  const t = await getTranslations('dashboard')
  const ta = await getTranslations('analytics')
  const session = await requireSessionOrRedirect()

  const [owned, collaborating, user] = await Promise.all([
    prisma.vehicle.findMany({ where: { ownerId: session.user.id }, orderBy: { updatedAt: 'desc' } }),
    prisma.vehicle.findMany({
      where: { collaborators: { some: { collaboratorUserId: session.user.id, status: 'ACTIVE' } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT } }),
  ])

  const atFreeLimit = !hasPro(user) && owned.length >= 1

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{t('title')}</h1>
        <div className="flex items-center gap-2">
          {owned.length > 0 && (
            <Link href="/dashboard/analytics" className="btn-secondary">
              {ta('viewGarageSpend')}
            </Link>
          )}
        {atFreeLimit ? (
          <span className="badge bg-surface-subtle text-ink-muted" title={t('freeLimitTitle')}>
            {t('freeLimitBadge')}
          </span>
        ) : (
          <Link href="/dashboard/vehicles/new" className="btn-primary">
            {t('addVehicle')}
          </Link>
        )}
        </div>
      </div>

      {owned.length === 0 && collaborating.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-ink-muted">{t('empty')}</p>
          <Link href="/dashboard/vehicles/new" className="btn-primary">
            {t('addVehicle')}
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

async function VehicleCard({
  vehicle,
  collaborator,
}: {
  vehicle: { id: string; make: string; model: string; year: number; projectType: ProjectType; coverPhotoUrl: string | null }
  collaborator?: boolean
}) {
  const t = await getTranslations('dashboard')
  const config = await getVocabulary(vehicle.projectType)
  return (
    <Link href={`/dashboard/vehicles/${vehicle.id}`} className="card block overflow-hidden hover:shadow-panel">
      <VehicleCoverImg url={vehicle.coverPhotoUrl} alt={`${vehicle.make} ${vehicle.model}`} />
      <div className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="badge badge-brand">{config.label}</span>
          {collaborator && <span className="badge bg-surface-subtle text-ink-muted">{t('collaborator')}</span>}
        </div>
        <h2 className="font-semibold text-ink">
          {vehicle.year} {vehicle.make} {vehicle.model}
        </h2>
      </div>
    </Link>
  )
}
