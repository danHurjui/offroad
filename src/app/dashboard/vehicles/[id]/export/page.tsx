import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { toNumberOrNull } from '@/lib/serialize'
import VehicleCoverImg from '@/components/VehicleCoverImg'
import ExportPdfButton from '@/components/ExportPdfButton'

// RL-014: build history PDF export. Free owners see this same page (it IS
// the "preview of the first page" the ticket asks for — real data, just no
// download) with an upgrade note instead of the download/share buttons.
export default async function ExportPdfPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isPro: true } })
  const isPro = Boolean(owner?.isPro)

  const tasks = await prisma.task.findMany({
    where: { vehicleId: vehicle.id },
    select: { category: true, status: true, workType: true, costRon: true, partsCostRon: true, labourCostRon: true },
  })
  const completeStatus = config.completeStatus
  const categoriesWithCompletion = new Set(tasks.filter((t) => t.status === completeStatus).map((t) => t.category))
  const progressPct = Math.round((categoriesWithCompletion.size / config.categories.length) * 100)
  const totalSpent = tasks.reduce((sum, t) => {
    const cost =
      t.workType === 'WORKSHOP'
        ? (toNumberOrNull(t.partsCostRon) ?? 0) + (toNumberOrNull(t.labourCostRon) ?? 0)
        : toNumberOrNull(t.costRon) ?? 0
    return sum + cost
  }, 0)

  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        ← Back to {config.screenTitle}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">Export build history</h1>

      <div className="card overflow-hidden">
        {vehicle.coverPhotoUrl && <VehicleCoverImg url={vehicle.coverPhotoUrl} alt={vehicleName} />}
        <div className="p-5">
          <h2 className="text-lg font-bold text-ink">{vehicleName}</h2>
          <p className="text-sm text-ink-muted">
            {config.progressLabel}: {progressPct}% · Total spent: {totalSpent.toLocaleString('ro-RO')} RON
          </p>
          <p className="mt-2 text-xs text-ink-faint">
            The full PDF includes every task grouped by category, cost breakdown, and up to 3 photos per task
            {vehicle.projectType === 'RESTORATION' ? ', plus the found state intake.' : '.'}
          </p>
        </div>
      </div>

      <div className="card mt-4 p-5">
        {isPro ? (
          <ExportPdfButton vehicleId={vehicle.id} vehicleName={vehicleName} />
        ) : (
          <p className="text-sm text-ink-muted">
            This is a preview of what your export includes. Upgrading to Pro is not available in this preview
            build — Pro will unlock the full PDF download.
          </p>
        )}
      </div>
    </div>
  )
}
