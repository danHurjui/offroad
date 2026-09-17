import Link from 'next/link'
import VehicleForm from '@/components/VehicleForm'
import { getTranslations } from 'next-intl/server'

export default async function NewVehiclePage() {
  const t = await getTranslations('vehicleNew')
  const tc = await getTranslations('common')
  const td = await getTranslations('dashboard')
  return (
    <div className="mx-auto max-w-xl">
      <Link href="/dashboard" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: td('title') })}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">{t('pageTitle')}</h1>
      <VehicleForm />
    </div>
  )
}
