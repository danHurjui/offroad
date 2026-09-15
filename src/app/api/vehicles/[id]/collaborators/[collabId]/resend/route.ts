import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { generateInviteToken, inviteAcceptUrl } from '@/lib/collaborators'
import { sendEmail, collaboratorInviteEmailHtml } from '@/lib/email'

// RL-030: resend/refresh a still-pending invite — regenerates the token and
// resets invitedAt so a stale 7-day-old link doesn't expire on the invitee
// right after they click a "resend" email. Owner only, PENDING only.
export async function POST(_req: NextRequest, { params }: { params: { id: string; collabId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const collaborator = await prisma.projectCollaborator.findUnique({ where: { id: params.collabId } })
  if (!collaborator || collaborator.vehicleId !== vehicle.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (collaborator.status !== 'PENDING') {
    return NextResponse.json({ error: 'Only pending invites can be resent' }, { status: 400 })
  }

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { displayName: true } })
  const inviteToken = generateInviteToken()

  const updated = await prisma.projectCollaborator.update({
    where: { id: collaborator.id },
    data: { inviteToken, invitedAt: new Date() },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  await sendEmail({
    to: collaborator.email,
    subject: `${owner?.displayName ?? 'Someone'} invited you to collaborate on RigLog`,
    html: collaboratorInviteEmailHtml({
      inviterName: owner?.displayName ?? 'Someone',
      vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      acceptUrl: inviteAcceptUrl(inviteToken, baseUrl),
    }),
  })

  const { inviteToken: _inviteToken, ...safe } = updated
  return NextResponse.json(safe)
}
