import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { toNumberOrNull } from '@/lib/serialize'
import WishlistItemForm from '@/components/WishlistItemForm'

export default async function EditWishlistItemPage({ params }: { params: { id: string; itemId: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()

  const item = await prisma.wishlistItem.findUnique({ where: { id: params.itemId } })
  if (!item || item.vehicleId !== vehicle.id) notFound()

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">Edit item</h1>
      <WishlistItemForm
        vehicleId={vehicle.id}
        projectType={vehicle.projectType}
        initialItem={{ ...item, estimatedCostRon: toNumberOrNull(item.estimatedCostRon) }}
      />
    </div>
  )
}
