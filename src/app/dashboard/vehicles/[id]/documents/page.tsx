import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { isHistoricVehicle } from '@/lib/documents'
import DocumentsBoard from '@/components/DocumentsBoard'
import { toNumberOrNull } from '@/lib/serialize'

export default async function DocumentsPage({ params }: { params: { id: string } }) {
  const tc = await getTranslations('common')
  const t = await getTranslations('documents')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = await getVocabulary(vehicle.projectType)
  const documents = await prisma.document.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: { expiryDate: 'asc' },
  })

  return (
    <div>
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('pageTitle')}</h1>
      <p className="mb-6 text-sm text-ink-muted">
        ITP, RCA, CASCO, Rovinietă and other reminders — you&apos;ll get an email at 30, 14, and 3 days before
        each one expires.
        {isHistoricVehicle(vehicle.year) && ' This vehicle qualifies for historic status: ITP every 2 years instead of annually.'}
      </p>
      <DocumentsBoard
        vehicleId={vehicle.id}
        documents={documents.map((d) => ({
          id: d.id,
          type: d.type,
          fileUrl: d.fileUrl,
          expiryDate: d.expiryDate.toISOString(),
          // Decimal cannot cross into a client component (pitfall #5).
          costRon: toNumberOrNull(d.costRon),
          paidAt: d.paidAt?.toISOString() ?? null,
        }))}
      />
    </div>
  )
}
