import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { toNumberOrNull } from '@/lib/serialize'
import WishlistItemForm from '@/components/WishlistItemForm'

export default async function EditWishlistItemPage({ params }: { params: { id: string; itemId: string } }) {
  const t = await getTranslations('wishlistForm')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const item = await prisma.wishlistItem.findUnique({ where: { id: params.itemId } })
  if (!item || item.vehicleId !== vehicle.id) notFound()

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}/wishlist/${item.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: item.name })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('editTitle')}</h1>
      <WishlistItemForm
        vehicleId={vehicle.id}
        projectType={vehicle.projectType}
        initialItem={{ ...item, estimatedCostRon: toNumberOrNull(item.estimatedCostRon) }}
      />
    </div>
  )
}
