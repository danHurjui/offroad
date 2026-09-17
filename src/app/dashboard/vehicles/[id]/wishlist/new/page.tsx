import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { getVocabulary } from '@/lib/vocabulary'
import WishlistItemForm from '@/components/WishlistItemForm'

export default async function NewWishlistItemPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('wishlistForm')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = await getVocabulary(vehicle.projectType)

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}/wishlist`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.wishlistLabel })}
      </Link>
      {/* Was a hardcoded English "Add to ..." — the one heading the
          bilingual pass missed, so a Romanian reader got it in English. */}
      <h1 className="mb-6 text-2xl font-bold text-ink">
        {t('addTitle', { list: config.wishlistLabel.toLowerCase() })}
      </h1>
      <WishlistItemForm vehicleId={vehicle.id} projectType={vehicle.projectType} />
    </div>
  )
}
