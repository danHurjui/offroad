import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { toNumberOrNull } from '@/lib/serialize'
import { isAccidentKind, isInsuranceRoute } from '@/lib/accidents'
import AccidentForm from '@/components/AccidentForm'
import { AccidentActions, AccidentRow } from '@/components/AccidentActions'
import { formatAmount } from '@/lib/money'

const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

// RL-050: accidents and damage, newest first. Every mode has them.
export default async function AccidentsPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('accidents')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)
  const isOwner = vehicle.access === 'owner'
  // RL-031: a collaborator does not see costs when the owner hid them.
  const showCosts = !hidesCosts(vehicle)

  const accidents = await prisma.accident.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    include: { photos: { orderBy: { createdAt: 'asc' }, select: { id: true, url: true } } },
  })

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-ink">{t('pageTitle')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('intro')}</p>

      <div className="card mb-6 p-4">
        <AccidentForm vehicleId={vehicle.id} />
      </div>

      {accidents.length === 0 ? (
        <p className="card p-6 text-center text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="card divide-y divide-surface-border">
          {accidents.map((a) => {
            const cost = toNumberOrNull(a.repairCostRon)
            return (
              <AccidentRow key={a.id} accidentId={a.id}>
                <li className="space-y-2 p-4">
                  <div className="text-sm text-ink-muted">
                    {fmtDate(a.date)}
                    {a.km !== null && ` · ${a.km.toLocaleString('ro-RO')} km`}
                  </div>
                  <div className="font-semibold text-ink">{isAccidentKind(a.kind) ? t(`kind.${a.kind}`) : a.kind}</div>
                  <p className="whitespace-pre-line text-sm text-ink">{a.description}</p>
                  <div className="text-sm text-ink-muted">
                    {[
                      isInsuranceRoute(a.insurance) && t(`insurance.${a.insurance}`),
                      a.repairedAt ? t('repairedOn', { date: fmtDate(a.repairedAt) }) : t('notRepaired'),
                      showCosts && cost !== null && t('cost', { amount: formatAmount(cost) }),
                      t('recordedOn', { date: fmtDate(a.createdAt) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <AccidentActions
                    vehicleId={vehicle.id}
                    accidentId={a.id}
                    photos={a.photos}
                    canEdit={isOwner || a.createdByUserId === session.user.id}
                  />
                </li>
              </AccidentRow>
            )
          })}
        </ul>
      )}
      <p className="mt-3 text-xs text-ink-faint">{t('photosPrivate')}</p>
    </div>
  )
}
