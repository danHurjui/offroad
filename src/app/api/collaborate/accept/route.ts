import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { isInviteExpired } from '@/lib/collaborators'
import { readJsonBody } from '@/lib/requestBody'

// RL-030: accept a collaborator invite. Authenticated — the logged-in
// user's account email must match the invited email (case-insensitive; the
// invite was stored lowercased). This is deliberately not "log in as
// whoever holds the link" so a forwarded invite email can't hijack another
// account.
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const token = typeof body.token === 'string' ? body.token : ''
    if (!token) {
      return await apiError('inviteTokenMissing', 400)
    }

    const collaborator = await prisma.projectCollaborator.findUnique({ where: { inviteToken: token } })
    if (!collaborator) {
      return await apiError('inviteNotFound', 404)
    }
    if (collaborator.status === 'REMOVED') {
      return await apiError('inviteRevoked', 410)
    }
    if (collaborator.status === 'ACTIVE') {
      return await apiError('inviteAlreadyAccepted', 400)
    }
    if (isInviteExpired(collaborator.invitedAt)) {
      return await apiError('inviteExpired', 410)
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } })
    if (!user || user.email.toLowerCase() !== collaborator.email.toLowerCase()) {
      return await apiError('inviteWrongEmail', 403)
    }

    const updated = await prisma.projectCollaborator.update({
      where: { id: collaborator.id },
      data: { status: 'ACTIVE', collaboratorUserId: session.user.id, acceptedAt: new Date() },
    })

    const { inviteToken: _inviteToken, ...safe } = updated
    return NextResponse.json({ ...safe, vehicleId: collaborator.vehicleId })
  } catch {
    return await apiError('internalError', 500)
  }
}
