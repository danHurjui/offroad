import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import WishlistItemForm from '@/components/WishlistItemForm'

export default async function NewWishlistItemPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">Add to {config.wishlistLabel.toLowerCase()}</h1>
      <WishlistItemForm vehicleId={vehicle.id} projectType={vehicle.projectType} />
    </div>
  )
}
