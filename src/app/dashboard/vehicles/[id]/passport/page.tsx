import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { loadPassport } from '@/lib/passportRecords'
import PassportDocument from '@/components/PassportDocument'
import PassportShare from '@/components/PassportShare'
import ExportPdfButton from '@/components/ExportPdfButton'
import { vehicleHasPro } from '@/lib/entitlement'

// RL-049: the owner's passport screen — the exact document a buyer would
// read (with the live link's choices), plus sharing and the PDF. Owner
// only: it is the owner's to hand over.
export default async function PassportPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('passport')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)

  const [isPro, active] = await Promise.all([
    vehicleHasPro(vehicle),
    prisma.passportLink.findFirst({ where: { vehicleId: vehicle.id, revokedAt: null }, orderBy: { createdAt: 'desc' } }),
  ])
  const options = active ?? { showPlate: false, showVin: false, showCosts: true }
  const now = new Date()
  const view = await loadPassport(vehicle, options, now)
  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>

      <section className="card mb-6 space-y-4 p-4" aria-labelledby="share-title">
        <h2 id="share-title" className="font-semibold text-ink">{t('shareTitle')}</h2>
        <p className="text-sm text-ink-muted">{t('shareIntro')}</p>
        <PassportShare
          vehicleId={vehicle.id}
          isPro={isPro}
          hasPlate={Boolean(vehicle.plate)}
          hasVin={Boolean(vehicle.vin)}
          active={
            active
              ? {
                  id: active.id,
                  token: active.token,
                  showPlate: active.showPlate,
                  showVin: active.showVin,
                  showCosts: active.showCosts,
                  createdAt: active.createdAt.toISOString(),
                }
              : null
          }
        />
        {isPro && (
          <div className="border-t border-surface-border pt-4">
            <ExportPdfButton endpoint={`/api/vehicles/${vehicle.id}/export/passport`} fallbackName={`RigLog_Passport_${vehicleName}`} />
            <p className="mt-2 text-xs text-ink-faint">{t('pdfHelp')}</p>
          </div>
        )}
      </section>

      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t('previewLabel')}</p>
      <PassportDocument view={view} projectType={vehicle.projectType} asOf={now} />
    </div>
  )
}
