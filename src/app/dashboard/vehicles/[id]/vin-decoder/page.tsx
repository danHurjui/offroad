import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import VinDecoderPanel from '@/components/VinDecoderPanel'
import { hasPro, PRO_SELECT } from '@/lib/pro'

// RL-028: VIN / chassis decoder — restoration mode, Pro-gated.
export default async function VinDecoderPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle || vehicle.projectType !== 'RESTORATION') notFound()

  const owner = await prisma.user.findUnique({ where: { id: vehicle.ownerId }, select: { ...PRO_SELECT } })
  const isPro = hasPro(owner)
  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]

  return (
    <div className="mx-auto max-w-xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        ← Back to {config.screenTitle}
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-ink">VIN decoder</h1>

      {isPro ? (
        <VinDecoderPanel
          vehicleId={vehicle.id}
          vin={vehicle.vin}
          decoded={vehicle.vinDecoded as never}
          source={vehicle.vinDecodeSource}
        />
      ) : (
        <div className="card border-brand-200 bg-brand-50 p-4 text-sm text-ink">
          Upgrade to Pro to decode this vehicle&apos;s VIN into its original factory specification.
        </div>
      )}
    </div>
  )
}
