import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { toNumberOrNull } from '@/lib/serialize'
import VehicleEditForm from '@/components/VehicleEditForm'
import MoveToOrganization from '@/components/MoveToOrganization'
import MoveOutOfOrganization from '@/components/MoveOutOfOrganization'

// RL-009 (vehicle settings): owner-only edit + public/private toggle.
export default async function EditVehiclePage({ params }: { params: { id: string } }) {
  const t = await getTranslations('vehicleEdit')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true } })
  // RL-038: a company vehicle names its organisation; a personal one can be
  // moved into one where this account manages vehicles.
  const [company, destinations] = await Promise.all([
    vehicle.organizationId
      ? prisma.organization.findUnique({ where: { id: vehicle.organizationId }, select: { name: true } })
      : Promise.resolve(null),
    vehicle.organizationId
      ? Promise.resolve([])
      : prisma.organizationMember.findMany({
          where: { userId: session.user.id, role: { in: ['OWNER', 'FLEET_MANAGER'] } },
          select: { organization: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        }),
  ])
  const config = await getVocabulary(vehicle.projectType)

  // Offered as cover choices. Task photos carry a denormalised vehicleId;
  // found-state photos hang off the restoration's 1:1 FoundState. Bounded
  // because this is a picker, not a gallery — the photo timeline is where
  // you go to see them all.
  const [taskPhotos, foundStatePhotos] = await Promise.all([
    prisma.taskPhoto.findMany({
      where: { vehicleId: vehicle.id },
      orderBy: { createdAt: 'desc' },
      select: { url: true, caption: true },
      take: 24,
    }),
    prisma.foundStatePhoto.findMany({
      where: { foundState: { vehicleId: vehicle.id } },
      orderBy: { createdAt: 'desc' },
      select: { url: true, caption: true },
      take: 12,
    }),
  ])
  const coverCandidates = [...taskPhotos, ...foundStatePhotos]

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
          companyName: company?.name ?? null,
          hideCostsFromCollaborators: vehicle.hideCostsFromCollaborators,
          hidePublicCost: vehicle.hidePublicCost,
          slug: vehicle.slug,
          ownerUsername: owner?.username ?? null,
          plate: vehicle.plate,
          firstRegistrationDate: vehicle.firstRegistrationDate?.toISOString() ?? null,
          fuelType: vehicle.fuelType,
          transmission: vehicle.transmission,
          engineCapacityCc: vehicle.engineCapacityCc,
          powerKw: vehicle.powerKw,
          colour: vehicle.colour,
          seats: vehicle.seats,
          purchaseDate: vehicle.purchaseDate?.toISOString() ?? null,
          purchasePriceRon: toNumberOrNull(vehicle.purchasePriceRon),
          currentValueRon: toNumberOrNull(vehicle.currentValueRon),
          currentValueAt: vehicle.currentValueAt?.toISOString() ?? null,
          financeType: vehicle.financeType,
          financeMonthlyRon: toNumberOrNull(vehicle.financeMonthlyRon),
          financeStartDate: vehicle.financeStartDate?.toISOString() ?? null,
          financeEndDate: vehicle.financeEndDate?.toISOString() ?? null,
        }}
        coverCandidates={coverCandidates}
      />
      {company && <MoveOutOfOrganization vehicleId={vehicle.id} organizationName={company.name} />}
      {destinations.length > 0 && (
        <MoveToOrganization vehicleId={vehicle.id} organizations={destinations.map((d) => d.organization)} isPublic={vehicle.isPublic} />
      )}
    </div>
  )
}
