import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess } from '@/lib/access'
import { getVocabulary } from '@/lib/vocabulary'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import DefectReportForm from '@/components/DefectReportForm'

// RL-040: report a defect — anyone with access, a driver first of all.
// A mode with no defect status (restoration) has no page.
export default async function DefectPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('defect')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)
  // Stored values, so from the config itself, never the translated labels.
  const defect = PROJECT_TYPE_CONFIG[vehicle.projectType].defect
  if (!defect) notFound()

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('intro')}</p>
      <DefectReportForm vehicleId={vehicle.id} defect={defect} />
    </div>
  )
}
