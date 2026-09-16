import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import VehicleEditForm from '@/components/VehicleEditForm'

// RL-009 (vehicle settings): owner-only edit + public/private toggle.
export default async function EditVehiclePage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { username: true } })

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">Vehicle settings</h1>
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
