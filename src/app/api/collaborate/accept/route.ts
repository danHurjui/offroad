import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { isInviteExpired } from '@/lib/collaborators'

// RL-030: accept a collaborator invite. Authenticated — the logged-in
// user's account email must match the invited email (case-insensitive; the
// invite was stored lowercased). This is deliberately not "log in as
// whoever holds the link" so a forwarded invite email can't hijack another
// account.
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  try {
    const body = await req.json()
    const token = typeof body.token === 'string' ? body.token : ''
    if (!token) {
      return NextResponse.json({ error: 'Missing invite token' }, { status: 400 })
    }

    const collaborator = await prisma.projectCollaborator.findUnique({ where: { inviteToken: token } })
    if (!collaborator) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }
    if (collaborator.status === 'REMOVED') {
      return NextResponse.json({ error: 'This invite has been revoked' }, { status: 410 })
    }
    if (collaborator.status === 'ACTIVE') {
      return NextResponse.json({ error: 'This invite has already been accepted' }, { status: 400 })
    }
    if (isInviteExpired(collaborator.invitedAt)) {
      return NextResponse.json({ error: 'This invite has expired' }, { status: 410 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } })
    if (!user || user.email.toLowerCase() !== collaborator.email.toLowerCase()) {
      return NextResponse.json(
        { error: 'This invite was sent to a different email address. Log in with that account to accept it.' },
        { status: 403 }
      )
    }

    const updated = await prisma.projectCollaborator.update({
      where: { id: collaborator.id },
      data: { status: 'ACTIVE', collaboratorUserId: session.user.id, acceptedAt: new Date() },
    })

    const { inviteToken: _inviteToken, ...safe } = updated
    return NextResponse.json({ ...safe, vehicleId: collaborator.vehicleId })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
