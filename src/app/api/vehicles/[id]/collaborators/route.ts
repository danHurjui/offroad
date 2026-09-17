import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { translator } from '@/i18n/translator'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { generateInviteToken, isValidEmail, inviteAcceptUrl, FREE_TIER_COLLABORATOR_LIMIT, DAILY_INVITE_LIMIT } from '@/lib/collaborators'
import { sendEmail, collaboratorInviteEmail, inviteeLocale } from '@/lib/email'
import { readJsonBody } from '@/lib/requestBody'
import { hasPro, PRO_SELECT } from '@/lib/pro'
import { appUrlForNotification } from '@/lib/appUrl'

// RL-030: invite mechanic/specialist as project collaborator. Owner only.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const collaborators = await prisma.projectCollaborator.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: { invitedAt: 'desc' },
    include: { collaboratorUser: { select: { displayName: true } } } })

  return NextResponse.json(
    collaborators.map(({ inviteToken: _inviteToken, ...c }) => c) // never leak the token in a list response
  )
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : ''
    const label = typeof body.label === 'string' ? body.label.trim() : null
    const role = body.role === 'SPECIALIST' ? 'SPECIALIST' : 'MECHANIC'

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const alreadyActive = await prisma.projectCollaborator.findFirst({
      where: { vehicleId: vehicle.id, email, status: 'ACTIVE' } })
    if (alreadyActive) {
      return NextResponse.json({ error: 'This email is already an active collaborator' }, { status: 400 })
    }

    const owner = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { ...PRO_SELECT, displayName: true, locale: true },
    })
    if (!hasPro(owner)) {
      const activeOrPendingCount = await prisma.projectCollaborator.count({
        where: { vehicleId: vehicle.id, status: { in: ['PENDING', 'ACTIVE'] } } })
      if (activeOrPendingCount >= FREE_TIER_COLLABORATOR_LIMIT) {
        return NextResponse.json(
          { error: `Free tier is limited to ${FREE_TIER_COLLABORATOR_LIMIT} collaborators. Upgrade to Pro for unlimited.`, code: 'UPGRADE_REQUIRED' },
          { status: 403 }
        )
      }
    }

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const invitesToday = await prisma.projectCollaborator.count({
      where: { vehicleId: vehicle.id, invitedAt: { gte: oneDayAgo } } })
    if (invitesToday >= DAILY_INVITE_LIMIT) {
      return NextResponse.json({ error: 'Daily invite limit reached for this vehicle. Try again tomorrow.' }, { status: 429 })
    }

    const inviteToken = generateInviteToken()
    const collaborator = await prisma.projectCollaborator.create({
      data: { vehicleId: vehicle.id, invitedByUserId: session.user.id, email, label, role, inviteToken } })

    // The invitation row is created either way — the owner can resend it
    // once the URL is configured. An email carrying a dead accept link is
    // worse than no email: it burns the recipient's trust and the token.
    const baseUrl = appUrlForNotification('the collaborator invitation email')
    if (baseUrl) {
      // The invitee may not have an account yet, so fall back to the
      // inviter's language rather than the default.
      const invitee = await prisma.user.findUnique({ where: { email }, select: { locale: true } })
      const locale = inviteeLocale(invitee, owner)
      const tEmail = await translator(locale, 'email')
      const inviterName = owner?.displayName ?? tEmail('collaboratorInvite.someone')

      const { subject, html } = await collaboratorInviteEmail(locale, {
        inviterName,
        vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        acceptUrl: inviteAcceptUrl(inviteToken, baseUrl),
      })
      await sendEmail({ to: email, subject, html })
    }

    const { inviteToken: _inviteToken, ...safe } = collaborator
    return NextResponse.json(safe, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
