import { NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { collectStorageKeys, deleteStoredFiles } from '@/lib/personalData'
import { organizationsOnAccountDeletion } from '@/lib/organizations'

/**
 * RL-009 / GDPR Art. 17: account deletion.
 *
 * Prisma cascades take care of the rows (User -> Vehicle -> Task ->
 * TaskPhoto and so on), but they say nothing about the bytes: every
 * uploaded photo, receipt and document lives in Blob storage or on disk
 * and would otherwise stay there after the account that owned it was
 * gone. The keys are gathered *before* the delete, because afterwards
 * there is nothing left to read them from.
 *
 * Donations are the one thing deliberately kept: that relation is
 * `onDelete: SetNull`, so the payment record survives without a person
 * attached to it. A charge that happened is an accounting record, and
 * dropping it is not erasure of personal data, it is losing the books.
 *
 * RL-038: a membership goes with the account, and an organisation nobody
 * else belongs to goes too. The one refusal is being the last OWNER of an
 * organisation other people are still in — it would be left with nobody
 * able to run it — so the answer names those organisations and the person
 * hands the role on (or deletes them) first.
 */
export async function DELETE() {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  try {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: session.user.id },
      select: { role: true, organization: { select: { id: true, name: true, members: { select: { role: true } } } } },
    })
    const orgs = organizationsOnAccountDeletion(memberships)
    if (orgs.blocking.length > 0) {
      return await apiErrorWith('orgLastOwnerAccount', { names: orgs.blocking.map((o) => o.name).join(', ') }, 409, {
        organizations: orgs.blocking,
      })
    }

    const keys = await collectStorageKeys(session.user.id)
    await prisma.$transaction([
      prisma.organization.deleteMany({ where: { id: { in: orgs.solo } } }),
      prisma.user.delete({ where: { id: session.user.id } }),
    ])
    // After the rows are gone, so a storage failure can't leave a
    // half-deleted account behind.
    await deleteStoredFiles(keys)
    return NextResponse.json({ message: 'Account deleted', filesDeleted: keys.length })
  } catch {
    return await apiError('internalError', 500)
  }
}
