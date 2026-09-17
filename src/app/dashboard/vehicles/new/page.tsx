import VehicleForm from '@/components/VehicleForm'
import { getTranslations } from 'next-intl/server'

export default async function NewVehiclePage() {
  const t = await getTranslations('vehicleNew')
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('pageTitle')}</h1>
      <VehicleForm />
    </div>
  )
}
