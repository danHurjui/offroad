import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { toNumberOrNull } from '@/lib/serialize'
import { isTyreSeason } from '@/lib/tyres'
import TyreSetForm from '@/components/TyreSetForm'
import { TyreRow, TyreSetActions } from '@/components/TyreSetActions'

const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

// RL-050: the tyre sets a vehicle owns, fitted one first.
export default async function TyresPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('tyres')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)
  const isOwner = vehicle.access === 'owner'
  const showCosts = !hidesCosts(vehicle)

  const [sets, latest] = await Promise.all([
    prisma.tyreSet.findMany({ where: { vehicleId: vehicle.id }, orderBy: [{ isFitted: 'desc' }, { createdAt: 'desc' }] }),
    prisma.odometerReading.findFirst({
      where: { vehicleId: vehicle.id },
      orderBy: [{ readAt: 'desc' }, { createdAt: 'desc' }],
      select: { km: true },
    }),
  ])

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('pageTitle')}</h1>

      <div className="card mb-6 p-4">
        <TyreSetForm vehicleId={vehicle.id} hasFitted={sets.some((s) => s.isFitted)} />
      </div>

      {sets.length === 0 ? (
        <p className="card p-6 text-center text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="card divide-y divide-surface-border">
          {sets.map((s) => {
            const tread = toNumberOrNull(s.treadDepthMm)
            const kmOn = s.isFitted && s.fittedKm !== null && latest && latest.km >= s.fittedKm ? latest.km - s.fittedKm : null
            return (
              <TyreRow key={s.id} setId={s.id}>
                <li className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{isTyreSeason(s.season) ? t(`season.${s.season}`) : s.season}</span>
                    {s.label && <span className="text-ink">{s.label}</span>}
                    {s.size && <span className="text-sm text-ink-muted">{s.size}</span>}
                    {s.isFitted && <span className="badge badge-success">{t('fittedBadge')}</span>}
                  </div>
                  <div className="text-sm text-ink-muted">
                    {[
                      tread !== null && `${tread.toLocaleString('ro-RO')} mm${s.treadMeasuredAt ? ` (${t('measuredOn', { date: fmtDate(s.treadMeasuredAt) })})` : ''}`,
                      s.dotYear && t('madeIn', { year: s.dotYear }),
                      kmOn !== null && t('kmOn', { km: kmOn.toLocaleString('ro-RO') }),
                      showCosts && s.costRon !== null &&
                        t('bought', {
                          amount: (toNumberOrNull(s.costRon) ?? 0).toLocaleString('ro-RO', { maximumFractionDigits: 2 }),
                          date: fmtDate(s.purchasedAt ?? s.createdAt),
                        }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <TyreSetActions
                    vehicleId={vehicle.id}
                    setId={s.id}
                    isFitted={s.isFitted}
                    canRemove={isOwner || s.createdByUserId === session.user.id}
                  />
                </li>
              </TyreRow>
            )
          })}
        </ul>
      )}
    </div>
  )
}
