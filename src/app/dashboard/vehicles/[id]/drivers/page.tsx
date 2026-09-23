import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import VehicleDrivers from '@/components/VehicleDrivers'

// RL-040: who drives this company vehicle — now, and before. Managers only.
export default async function VehicleDriversPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('drivers')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle || !vehicle.organizationId) notFound()
  const config = await getVocabulary(vehicle.projectType)

  const [assignments, drivers] = await Promise.all([
    prisma.vehicleAssignment.findMany({
      where: { vehicleId: vehicle.id },
      include: {
        driver: { select: { displayName: true } },
        startReading: { select: { km: true } },
        endReading: { select: { km: true } },
        photos: { select: { id: true, stage: true, url: true }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { startedAt: 'desc' },
    }),
    prisma.organizationMember.findMany({
      where: { organizationId: vehicle.organizationId, role: 'DRIVER' },
      include: { user: { select: { id: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('intro')}</p>
      <VehicleDrivers
        vehicleId={vehicle.id}
        drivers={drivers.map((d) => ({ id: d.user.id, name: d.user.displayName }))}
        assignments={assignments.map((a) => ({
          id: a.id,
          driverName: a.driver.displayName,
          startedAt: a.startedAt.toISOString(),
          endedAt: a.endedAt?.toISOString() ?? null,
          note: a.note,
          startKm: a.startReading?.km ?? null,
          endKm: a.endReading?.km ?? null,
          photos: a.photos.map((p) => ({ id: p.id, stage: p.stage === 'END' ? ('END' as const) : ('START' as const), url: p.url })),
        }))}
      />
    </div>
  )
}
