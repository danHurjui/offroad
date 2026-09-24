import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import TrailRecorder from '@/components/TrailRecorder'
import { vehicleHasPro } from '@/lib/entitlement'

export default async function RecordTrailRunPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('trailLog')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle || vehicle.projectType !== 'OFFROAD') notFound()

  if (!(await vehicleHasPro(vehicle))) notFound()

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}/trail-log`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {t('backToTrailLog')}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('recordTitle')}</h1>
      <TrailRecorder vehicleId={vehicle.id} />
    </div>
  )
}
