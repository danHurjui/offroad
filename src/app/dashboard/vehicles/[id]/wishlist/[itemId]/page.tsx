import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { labelFor } from '@/lib/projectType'
import { getVocabulary } from '@/lib/vocabulary'
import { serializeWishlistItem, serializeWishlistPriceEntry } from '@/lib/serialize'
import WishlistPriceAlert from '@/components/WishlistPriceAlert'
import { hasPro, PRO_SELECT } from '@/lib/pro'

// RL-026: wishlist/parts-hunt item detail — price alert target + history
// chart. Pro-gated; the base item fields (name/category/status/...) stay
// editable from the existing edit page, this page is alert-only.
export default async function WishlistItemDetailPage({ params }: { params: { id: string; itemId: string } }) {
  const t = await getTranslations('priceAlert')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const item = await prisma.wishlistItem.findUnique({ where: { id: params.itemId } })
  if (!item || item.vehicleId !== vehicle.id) notFound()

  const owner = await prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: { ...PRO_SELECT } })
  const isPro = hasPro(owner)

  const config = await getVocabulary(vehicle.projectType)
  const priceHistory = isPro
    ? await prisma.wishlistPriceEntry.findMany({
        where: { wishlistItemId: item.id },
        orderBy: { recordedAt: 'asc' },
      })
    : []

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}/wishlist`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        ← Back to {config.wishlistLabel}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{item.name}</h1>
      {item.category && <p className="mb-6 text-sm text-ink-faint">{labelFor(config.categories, item.category)}</p>}

      {isPro ? (
        <WishlistPriceAlert
          vehicleId={vehicle.id}
          item={serializeWishlistItem(item)}
          priceHistory={priceHistory.map((e) => ({
            ...serializeWishlistPriceEntry(e),
            recordedAt: e.recordedAt.toISOString(),
          }))}
        />
      ) : (
        <div className="card note p-4 text-sm text-ink">
          {t('proOnly')}
        </div>
      )}
    </div>
  )
}
