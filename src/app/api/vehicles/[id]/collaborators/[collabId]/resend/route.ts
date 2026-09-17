import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { translator } from '@/i18n/translator'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { generateInviteToken, inviteAcceptUrl } from '@/lib/collaborators'
import { sendEmail, collaboratorInviteEmail, inviteeLocale } from '@/lib/email'
import { appUrlForNotification } from '@/lib/appUrl'

// RL-030: resend/refresh a still-pending invite — regenerates the token and
// resets invitedAt so a stale 7-day-old link doesn't expire on the invitee
// right after they click a "resend" email. Owner only, PENDING only.
export async function POST(_req: NextRequest, { params }: { params: { id: string; collabId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const collaborator = await prisma.projectCollaborator.findUnique({ where: { id: params.collabId } })
  if (!collaborator || collaborator.vehicleId !== vehicle.id) {
    return await apiError('notFound', 404)
  }
  if (collaborator.status !== 'PENDING') {
    return await apiError('onlyPendingResend', 400)
  }

  const owner = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { displayName: true, locale: true },
  })
  const inviteToken = generateInviteToken()

  const updated = await prisma.projectCollaborator.update({
    where: { id: collaborator.id },
    data: { inviteToken, invitedAt: new Date() },
  })

  // Same as the initial invite: a dead accept link is worse than silence.
  const baseUrl = appUrlForNotification('the collaborator invitation email')
  if (baseUrl) {
    const invitee = await prisma.user.findUnique({
      where: { email: collaborator.email },
      select: { locale: true },
    })
    const locale = inviteeLocale(invitee, owner)
    const tEmail = await translator(locale, 'email')

    const { subject, html } = await collaboratorInviteEmail(locale, {
      inviterName: owner?.displayName ?? tEmail('collaboratorInvite.someone'),
      vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      acceptUrl: inviteAcceptUrl(inviteToken, baseUrl),
    })
    await sendEmail({ to: collaborator.email, subject, html })
  }

  const { inviteToken: _inviteToken, ...safe } = updated
  return NextResponse.json(safe)
}
