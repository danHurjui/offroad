import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { ODOMETER_SOURCES, currentReading, distanceCovered, isOverrideReason } from '@/lib/odometer'
import OdometerQuickAdd from '@/components/OdometerQuickAdd'
import { ReadingRow, RemoveReadingButton } from '@/components/OdometerReadingRow'

const fmtKm = (km: number) => km.toLocaleString('ro-RO')
const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

// RL-044: the whole mileage history of one vehicle, newest first.
export default async function OdometerPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('odometer')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)
  const isOwner = vehicle.ownerId === session.user.id

  const readings = await prisma.odometerReading.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: [{ readAt: 'desc' }, { createdAt: 'desc' }],
    include: { task: { select: { id: true, name: true } } },
  })
  const current = currentReading(readings)
  const covered = distanceCovered(readings)

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('pageTitle')}</h1>

      <div className="card mb-6 p-4">
        <div className="text-xs text-ink-faint">{t('current')}</div>
        {current ? (
          <>
            <div className="text-2xl font-semibold text-ink">{t('km', { km: fmtKm(current.km) })}</div>
            <div className="text-sm text-ink-muted">{t('readOn', { date: fmtDate(current.readAt) })}</div>
            {covered > 0 && <div className="mt-1 text-sm text-ink-muted">{t('distance', { km: fmtKm(covered) })}</div>}
          </>
        ) : (
          <div className="text-ink-muted">{t('none')}</div>
        )}
      </div>

      <div className="card mb-6 p-4">
        <OdometerQuickAdd vehicleId={vehicle.id} />
        <p className="mt-3 text-xs text-ink-faint">{t('why')}</p>
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('history')}</h2>
      {readings.length === 0 ? (
        <p className="card p-6 text-center text-ink-muted">{t('emptyHistory')}</p>
      ) : (
        <ul className="card divide-y divide-surface-border">
          {readings.map((r) => (
            <ReadingRow key={r.id} readingId={r.id}>
              <li className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{t('km', { km: fmtKm(r.km) })}</span>
                    {r.isOverride && isOverrideReason(r.overrideReason) && (
                      <span className="badge badge-warn" title={t(`override.${r.overrideReason}`)}>
                        {t('overrideBadge')}: {t(`override.${r.overrideReason}`)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-ink-muted">
                    {fmtDate(r.readAt)} ·{' '}
                    {r.task ? (
                      <Link href={`/dashboard/vehicles/${vehicle.id}/tasks/${r.task.id}`} className="text-brand-600 hover:underline dark:text-brand-300">
                        {r.task.name}
                      </Link>
                    ) : (
                      t(`source.${(ODOMETER_SOURCES as readonly string[]).includes(r.source) ? r.source : 'MANUAL'}`)
                    )}
                  </div>
                  {r.note && <p className="mt-1 text-sm text-ink">{r.note}</p>}
                </div>
                {(isOwner || r.createdByUserId === session.user.id) && (
                  <RemoveReadingButton vehicleId={vehicle.id} readingId={r.id} km={r.km} />
                )}
              </li>
            </ReadingRow>
          ))}
        </ul>
      )}
    </div>
  )
}
