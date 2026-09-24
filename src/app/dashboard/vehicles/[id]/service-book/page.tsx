import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { labelFor } from '@/lib/projectType'
import { getVocabulary } from '@/lib/vocabulary'
import { loadServiceBook } from '@/lib/serviceBookRecords'
import type { RowFlag } from '@/lib/serviceBook'
import ExportPdfButton from '@/components/ExportPdfButton'
import { vehicleHasPro } from '@/lib/entitlement'

const money = (n: number) => n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })
const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

// RL-047: the service book — a view over the completed jobs, in the order
// they happened, never a second place to record work. Free to read; the
// PDF is the owner's, and Pro.
export default async function ServiceBookPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('serviceBook')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)
  const isOwner = vehicle.access === 'owner'
  // Same rule as the other cost views: per-job costs are hidden from a
  // collaborator the owner hides them from, so the column goes too.
  const hideCosts = hidesCosts(vehicle)
  const canExport = isOwner && (await vehicleHasPro(vehicle))

  const book = await loadServiceBook(vehicle.id, config.completeStatus)
  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
  const flagText = (f: RowFlag) =>
    f.kind === 'loggedLate'
      ? t('flag.loggedLate', { date: fmtDate(f.loggedOn) })
      : f.kind === 'odometerReset'
        ? t('flag.odometerReset')
        : t('flag.kmBelowEarlier', { km: f.earlierKm.toLocaleString('ro-RO') })

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-3 text-sm text-ink-muted">{t('subtitle', { status: labelFor(config.statusTags, config.completeStatus) })}</p>
      {/* Everyone reading it sees whose account it is — collaborators included. */}
      <p className="note-warn mb-6 rounded-lg border p-3 text-sm text-ink">
        <span className="font-semibold">{t('ownerView')}.</span> {t('provenance')}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="card p-4">
          <div className="text-xs text-ink-faint">{t('entries')}</div>
          <div className="text-2xl font-semibold text-ink">{book.rows.length}</div>
          {book.rows.length > 0 && <div className="text-sm text-ink-muted">{t('withKm', { count: book.withKm })}</div>}
        </div>
        <div className="card p-4">
          <div className="text-xs text-ink-faint">{t('total')}</div>
          <div className="text-2xl font-semibold text-ink">{hideCosts ? t('hidden') : `${money(book.total)} RON`}</div>
        </div>
      </div>

      {isOwner && (
        <div className="card mb-6 p-4">
          {canExport ? (
            <ExportPdfButton endpoint={`/api/vehicles/${vehicle.id}/export/service-book`} fallbackName={`RigLog_ServiceBook_${vehicleName}`} />
          ) : (
            <p className="text-sm text-ink-muted">{t('exportPro')}</p>
          )}
        </div>
      )}

      {book.rows.length === 0 ? (
        <p className="card p-6 text-center text-ink-muted">{t('empty')}</p>
      ) : (
        <ol className="card divide-y divide-surface-border">
          {book.rows.map((row) => (
            <li key={row.taskId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 p-4">
              <div className="min-w-0 flex-1 basis-56">
                <div className="text-sm text-ink-muted">
                  <time dateTime={row.date.toISOString().slice(0, 10)}>{fmtDate(row.date)}</time>
                  {' · '}
                  {row.km !== null ? `${row.km.toLocaleString('ro-RO')} km` : t('noKm')}
                </div>
                <Link href={`/dashboard/vehicles/${vehicle.id}/tasks/${row.taskId}`} className="font-semibold text-ink hover:underline">
                  {row.name}
                </Link>
                <div className="text-sm text-ink-muted">
                  {[
                    labelFor(config.categories, row.category),
                    row.parts && t('partsValue', { parts: row.parts }),
                    row.workType === 'WORKSHOP' ? row.workshop ?? t('workshop') : t('diy'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {row.flags.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-ink-faint">
                    {row.flags.map((f) => (
                      <li key={f.kind}>{flagText(f)}</li>
                    ))}
                  </ul>
                )}
                {(row.receiptUrl || row.photoCount > 0) && (
                  <div className="mt-1 flex flex-wrap gap-3 text-sm">
                    {row.receiptUrl && (
                      <a href={`/api/uploads/${row.receiptUrl}`} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline dark:text-brand-300">
                        {t('receipt')}
                      </a>
                    )}
                    {row.photoCount > 0 && (
                      <Link href={`/dashboard/vehicles/${vehicle.id}/tasks/${row.taskId}`} className="text-brand-600 hover:underline dark:text-brand-300">
                        {t('photos', { count: row.photoCount })}
                      </Link>
                    )}
                  </div>
                )}
              </div>
              {!hideCosts && <div className="shrink-0 font-semibold text-ink">{row.cost > 0 ? `${money(row.cost)} RON` : '—'}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
