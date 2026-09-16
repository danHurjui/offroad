import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import TrailRecorder from '@/components/TrailRecorder'
import { hasPro, PRO_SELECT } from '@/lib/pro'

export default async function RecordTrailRunPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle || vehicle.projectType !== 'OFFROAD') notFound()

  const owner = await prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: { ...PRO_SELECT } })
  if (!hasPro(owner)) notFound()

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}/trail-log`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        ← Back to trail log
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">Record a trail run</h1>
      <TrailRecorder vehicleId={vehicle.id} />
    </div>
  )
}
