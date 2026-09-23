import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { toNumberOrNull } from '@/lib/serialize'
import FoundStateForm from '@/components/FoundStateForm'

export default async function FoundStatePage({ params }: { params: { id: string } }) {
  const t = await getTranslations('foundState')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  if (vehicle.projectType !== 'RESTORATION') notFound()

  const foundState = await prisma.foundState.findUnique({
    where: { vehicleId: vehicle.id },
    include: { photos: { orderBy: { createdAt: 'asc' } } },
  })

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {t('backToRestoration')}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('pageTitle')}</h1>
      <p className="mb-6 text-sm text-ink-muted">
        {t('pageSubtitle')}
      </p>
      <FoundStateForm
        vehicleId={vehicle.id}
        initial={
          foundState
            ? { ...foundState, acquisitionDate: foundState.acquisitionDate.toISOString(), purchasePriceRon: hidesCosts(vehicle) ? null : toNumberOrNull(foundState.purchasePriceRon) }
            : null
        }
      />
    </div>
  )
}
