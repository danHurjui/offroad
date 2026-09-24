import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG, type ProjectType } from '@/lib/projectType'
import { powertrainOf, takesCharge, takesFuel } from '@/lib/powertrain'
import HandoverForm from './HandoverForm'

/**
 * RL-040: the driver's one screen, at the top of the vehicle they are
 * driving — report a defect, log what they do, their papers, and the two
 * ends of the handover. Server-rendered; shown only for `driver` access.
 */
export default async function DriverPanel({
  vehicleId,
  projectType,
  fuelType,
  driverUserId,
}: {
  vehicleId: string
  projectType: ProjectType
  fuelType: string | null
  driverUserId: string
}) {
  const t = await getTranslations('driverPanel')
  const assignment = await prisma.vehicleAssignment.findFirst({
    where: { vehicleId, driverUserId, endedAt: null },
    select: { id: true, startedAt: true, startReadingId: true },
  })
  if (!assignment) return null
  const base = `/dashboard/vehicles/${vehicleId}`
  const canReport = PROJECT_TYPE_CONFIG[projectType].defect !== null
  const powertrain = powertrainOf(fuelType)

  return (
    <section className="card mb-6 space-y-4 p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold text-ink">{t('title')}</h2>
        <p className="text-xs text-ink-muted">
          {t('since', { date: assignment.startedAt.toLocaleDateString('ro-RO', { timeZone: 'UTC' }) })}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {canReport && (
          <Link href={`${base}/defect`} className="btn-primary text-center">{t('report')}</Link>
        )}
        {takesFuel(powertrain) && <Link href={`${base}/fuel`} className="btn-secondary text-center">{t('fuel')}</Link>}
        {takesCharge(powertrain) && <Link href={`${base}/charging`} className="btn-secondary text-center">{t('charge')}</Link>}
        <Link href={`${base}/expenses`} className="btn-secondary text-center">{t('expense')}</Link>
        <Link href={`${base}/odometer`} className="btn-secondary text-center">{t('km')}</Link>
        <Link href={`${base}/trips`} className="btn-secondary text-center">{t('trips')}</Link>
        <Link href={`${base}/documents`} className="btn-secondary text-center">{t('documents')}</Link>
      </div>
      {assignment.startReadingId === null && (
        <div className="rounded-lg border border-surface-border p-3">
          <h3 className="mb-1 text-sm font-semibold text-ink">{t('startTitle')}</h3>
          <p className="mb-3 text-xs text-ink-muted">{t('startHelp')}</p>
          <HandoverForm vehicleId={vehicleId} assignmentId={assignment.id} stage="start" />
        </div>
      )}
      <details className="rounded-lg border border-surface-border p-3">
        <summary className="cursor-pointer text-sm font-semibold text-ink">{t('endTitle')}</summary>
        <p className="mb-3 mt-2 text-xs text-ink-muted">{t('endHelp')}</p>
        <HandoverForm vehicleId={vehicleId} assignmentId={assignment.id} stage="end" />
      </details>
    </section>
  )
}
