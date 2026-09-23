import { redirect } from 'next/navigation'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { prisma } from '@/lib/prisma'
import { accessForRole } from '@/lib/access'

// RL-038: the header's "Business" entry. With one organisation it goes
// straight to where the work is — the fleet board for its OWNERs and
// FLEET_MANAGERs, the organisation page for everyone else; with none or
// several, to the list (which is also where one is created).
export default async function BusinessPage() {
  const session = await requireSessionOrRedirect()
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
    take: 2,
  })
  if (memberships.length === 1) {
    const [only] = memberships
    redirect(
      accessForRole(only.role) === 'owner'
        ? `/dashboard/organizations/${only.organizationId}/fleet`
        : `/dashboard/organizations/${only.organizationId}`
    )
  }
  redirect('/dashboard/organizations')
}
