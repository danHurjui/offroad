import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { serializeWishlistItem } from '@/lib/serialize'
import WishlistBoard from '@/components/WishlistBoard'

export default async function WishlistPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const items = await prisma.wishlistItem.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: { priority: 'asc' },
  })

  return (
    <div>
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        ← Back to {config.screenTitle}
      </Link>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">{config.wishlistLabel}</h1>
        <Link href={`/dashboard/vehicles/${vehicle.id}/wishlist/new`} className="btn-primary">
          + Add item
        </Link>
      </div>
      <WishlistBoard
        vehicleId={vehicle.id}
        projectType={vehicle.projectType}
        items={items.map(serializeWishlistItem)}
      />
    </div>
  )
}
