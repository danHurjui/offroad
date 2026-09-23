import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { getDocumentStatus, isHistoricVehicle, daysUntilMessage } from '@/lib/documents'
import DocumentsBoard from '@/components/DocumentsBoard'
import { toNumberOrNull } from '@/lib/serialize'

const STATUS_CLASS = { valid: 'badge-success', expiring: 'badge-warn', expired: 'badge-danger' } as const

export default async function DocumentsPage({ params }: { params: { id: string } }) {
  const tc = await getTranslations('common')
  const t = await getTranslations('documents')
  const th = await getTranslations('health')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  // The owner's screen, and (RL-040) the driver's, read-only: a van stopped
  // at the roadside needs its papers to hand. Nobody else.
  if (!vehicle || (vehicle.access !== 'owner' && vehicle.access !== 'driver')) notFound()

  const config = await getVocabulary(vehicle.projectType)
  const documents = await prisma.document.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: { expiryDate: 'asc' },
  })

  return (
    <div>
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('pageTitle')}</h1>
      <p className="mb-6 text-sm text-ink-muted">
        ITP, RCA, CASCO, Rovinietă and other reminders — you&apos;ll get an email at 30, 14, and 3 days before
        each one expires.
        {isHistoricVehicle(vehicle.year) && ' This vehicle qualifies for historic status: ITP every 2 years instead of annually.'}
      </p>
      {vehicle.access === 'driver' ? (
        // Read-only, and never what a document cost.
        documents.length === 0 ? (
          <p className="card p-4 text-sm text-ink-faint">{t('driverNone')}</p>
        ) : (
          <ul className="card divide-y divide-surface-border">
            {documents.map((d) => {
              const status = getDocumentStatus(d.expiryDate)
              const days = daysUntilMessage(status.daysUntil)
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span className="font-medium text-ink">{th(`doc.${d.type}`)}</span>
                  <span className="flex items-center gap-2 text-xs text-ink-muted">
                    {d.expiryDate.toLocaleDateString('ro-RO', { timeZone: 'UTC' })}
                    <span className={`badge ${STATUS_CLASS[status.status]}`}>{t(days.key, days.values)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        )
      ) : (
      <DocumentsBoard
        vehicleId={vehicle.id}
        documents={documents.map((d) => ({
          id: d.id,
          type: d.type,
          fileUrl: d.fileUrl,
          expiryDate: d.expiryDate.toISOString(),
          // Decimal cannot cross into a client component (pitfall #5).
          costRon: toNumberOrNull(d.costRon),
          paidAt: d.paidAt?.toISOString() ?? null,
        }))}
      />
      )}
    </div>
  )
}
