import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import VehicleEditForm from '@/components/VehicleEditForm'

// RL-009 (vehicle settings): owner-only edit + public/private toggle.
export default async function EditVehiclePage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">Vehicle settings</h1>
      <VehicleEditForm
        vehicle={{
          id: vehicle.id,
          make: vehicle.make,
          model: vehicle.model,
          year: vehicle.year,
          generation: vehicle.generation,
          engine: vehicle.engine,
          vin: vehicle.vin,
          isPublic: vehicle.isPublic,
        }}
      />
    </div>
  )
}
