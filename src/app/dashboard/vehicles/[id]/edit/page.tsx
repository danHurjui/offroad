import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import VehicleEditForm from '@/components/VehicleEditForm'

// RL-009 (vehicle settings): owner-only edit + public/private toggle.
export default async function EditVehiclePage({ params }: { params: { id: string } }) {
  const t = await getTranslations('vehicleEdit')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true } })
  const config = await getVocabulary(vehicle.projectType)

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('pageTitle')}</h1>
      <VehicleEditForm
        vehicle={{
          id: vehicle.id,
          projectType: vehicle.projectType,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          generation: vehicle.generation,
          engine: vehicle.engine,
          vin: vehicle.vin,
          coverPhotoUrl: vehicle.coverPhotoUrl,
          isPublic: vehicle.isPublic,
          hideCostsFromCollaborators: vehicle.hideCostsFromCollaborators,
          hidePublicCost: vehicle.hidePublicCost,
          slug: vehicle.slug,
          ownerUsername: owner?.username ?? null,
        }}
      />
    </div>
  )
}
