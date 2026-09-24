import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { powertrainOf, takesCharge } from '@/lib/powertrain'
import { isBatterySource } from '@/lib/batteryHealth'
import BatteryReadingForm from '@/components/BatteryReadingForm'
import BatteryWarrantyForm from '@/components/BatteryWarrantyForm'
import { BatteryReadingItem, BatteryReadingRow } from '@/components/BatteryReadingRemove'

const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })
const num = (n: number) => n.toLocaleString('ro-RO')

// RL-056 (#124): the high-voltage battery — state of health as recorded, and the warranty.
export default async function BatteryPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('battery')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)
  const isOwner = vehicle.access === 'owner'

  // Newest first on screen; Car Health and the passport sort their own way.
  const readings = await prisma.batteryHealthReading.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-ink">{t('pageTitle')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('intro')}</p>

      {/* Hidden, never cleared: a fuel type corrected afterwards keeps the readings. */}
      {!takesCharge(powertrainOf(vehicle.fuelType)) && (
        <p className="note mb-6 rounded-lg border p-3 text-sm text-ink">{t('notPlugIn')}</p>
      )}

      <div className="card mb-6 p-4">
        <BatteryReadingForm vehicleId={vehicle.id} />
      </div>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('history')}</h2>
      {readings.length === 0 ? (
        <p className="card mb-6 p-6 text-center text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="card mb-6 divide-y divide-surface-border">
          {readings.map((r) => (
            <BatteryReadingRow key={r.id} readingId={r.id}>
              <BatteryReadingItem
                vehicleId={vehicle.id}
                reading={{
                  id: r.id,
                  sohPercent: r.sohPercent,
                  source: isBatterySource(r.source) ? r.source : 'WORKSHOP_TEST',
                  date: r.date.toISOString().slice(0, 10),
                  km: r.km,
                  note: r.note,
                }}
                dateLabel={fmtDate(r.date)}
                reportUrl={r.reportUrl}
                canChange={isOwner || r.createdByUserId === session.user.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink">{t('recordedValue', { soh: r.sohPercent })}</span>
                  <span className="badge badge-neutral">{t(`source.${r.source}`)}</span>
                </div>
                <div className="text-sm text-ink-muted">
                  {fmtDate(r.date)}
                  {r.km !== null && ` · ${num(r.km)} km`}
                </div>
                {r.note && <p className="mt-1 whitespace-pre-line text-sm text-ink">{r.note}</p>}
              </BatteryReadingItem>
            </BatteryReadingRow>
          ))}
        </ul>
      )}

      {isOwner ? (
        <div className="card p-4">
          <BatteryWarrantyForm
            vehicleId={vehicle.id}
            until={vehicle.batteryWarrantyUntil ? vehicle.batteryWarrantyUntil.toISOString().slice(0, 10) : null}
            km={vehicle.batteryWarrantyKm}
          />
        </div>
      ) : (
        (vehicle.batteryWarrantyUntil || vehicle.batteryWarrantyKm) && (
          <p className="card p-4 text-sm text-ink">
            {t('warrantyTitle')}:{' '}
            {[vehicle.batteryWarrantyUntil && t('warrantyUntilValue', { date: fmtDate(vehicle.batteryWarrantyUntil) }), vehicle.batteryWarrantyKm && t('warrantyKmValue', { km: num(vehicle.batteryWarrantyKm) })]
              .filter(Boolean)
              .join(` ${t('whicheverFirst')} `)}
          </p>
        )
      )}
    </div>
  )
}
