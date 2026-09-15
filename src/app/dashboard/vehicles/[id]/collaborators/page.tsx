import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import CollaboratorsBoard from '@/components/CollaboratorsBoard'

// RL-030/031: owner-only collaborator management. Not linked from
// collaborator nav (they have no access to it — requireVehicleOwner 404s).
export default async function CollaboratorsPage({ params }: { params: { id: string } }) {
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) notFound()

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const collaborators = await prisma.projectCollaborator.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: { invitedAt: 'desc' },
    include: { collaboratorUser: { select: { displayName: true } } },
  })

  return (
    <div>
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 hover:underline">
        ← Back to {config.screenTitle}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">Collaborators</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Invite a mechanic or specialist to log tasks and photos on this build. Collaborator accounts are always
        free — they see the work, not your account.
      </p>
      <CollaboratorsBoard
        vehicleId={vehicle.id}
        collaborators={collaborators.map((c) => ({
          id: c.id,
          email: c.email,
          label: c.label,
          role: c.role,
          status: c.status,
          invitedAt: c.invitedAt.toISOString(),
          acceptedAt: c.acceptedAt ? c.acceptedAt.toISOString() : null,
          collaboratorDisplayName: c.collaboratorUser?.displayName ?? null,
        }))}
      />
    </div>
  )
}
