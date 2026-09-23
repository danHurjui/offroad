import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { inviteStatus } from '@/lib/organizationInvites'
import { loadInviteForOwner } from '../load'

type Params = { params: { orgId: string; inviteId: string } }

/** Withdraws a pending invitation, so its link stops working. Owners only. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const loaded = await loadInviteForOwner(params.orgId, params.inviteId, session.user.id)
  if (!loaded.ok) return loaded.error
  const status = inviteStatus(loaded.invite)
  if (status === 'accepted') return await apiError('inviteAlreadyAccepted', 400)
  if (status === 'revoked') return await apiError('alreadyRemoved', 400)

  await prisma.organizationInvite.update({ where: { id: loaded.invite.id }, data: { revokedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
