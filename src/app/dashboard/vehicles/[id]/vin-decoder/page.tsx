import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import VinDecoderPanel from '@/components/VinDecoderPanel'
import { hasPro, PRO_SELECT } from '@/lib/pro'

// RL-028: VIN / chassis decoder — restoration mode, Pro-gated.
export default async function VinDecoderPage({ params }: { params: { id: string } }) {
  const tc = await getTranslations('common')
  const t = await getTranslations('vin')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle || vehicle.projectType !== 'RESTORATION') notFound()

  const owner = await prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: { ...PRO_SELECT } })
  const isPro = hasPro(owner)
  const config = await getVocabulary(vehicle.projectType)

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('pageTitle')}</h1>

      {isPro ? (
        <VinDecoderPanel
          vehicleId={vehicle.id}
          vin={vehicle.vin}
          decoded={vehicle.vinDecoded as never}
          source={vehicle.vinDecodeSource}
        />
      ) : (
        <div className="card note p-4 text-sm text-ink">
          {t('proOnly')}
        </div>
      )}
    </div>
  )
}
