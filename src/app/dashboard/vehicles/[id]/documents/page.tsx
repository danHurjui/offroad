import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { isHistoricVehicle } from '@/lib/documents'
import DocumentsBoard from '@/components/DocumentsBoard'

export default async function DocumentsPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const documents = await prisma.document.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: { expiryDate: 'asc' },
  })

  return (
    <div>
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        ← Back to {config.screenTitle}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">Documents</h1>
      <p className="mb-6 text-sm text-ink-muted">
        ITP, RCA, CASCO, Rovinietă and other reminders — you&apos;ll get an email at 30, 14, and 3 days before
        each one expires.
        {isHistoricVehicle(vehicle.year) && ' This vehicle qualifies for historic status: ITP every 2 years instead of annually.'}
      </p>
      <DocumentsBoard
        vehicleId={vehicle.id}
        documents={documents.map((d) => ({ ...d, expiryDate: d.expiryDate.toISOString() }))}
      />
    </div>
  )
}
