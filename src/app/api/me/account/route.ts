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
 *
 * Company vehicles are the organisation's: the ones this account is the
 * record for pass to another owner there, and an organisation that goes
 * with the account takes its vehicles and their files.
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

    // Company vehicles this account is the record for, in organisations
    // that outlive it, pass to another OWNER there — otherwise the account's
    // cascade would take the company's vehicles with it. The slug is
    // cleared: it is only for a public page, which a company vehicle never
    // has, and it could collide with the heir's own.
    const recorded = await prisma.vehicle.findMany({
      where: { ownerId: session.user.id, organizationId: { not: null } },
      select: { id: true, organizationId: true },
    })
    for (const v of recorded) {
      if (!v.organizationId || orgs.solo.includes(v.organizationId)) continue
      const heir = await prisma.organizationMember.findFirst({
        where: { organizationId: v.organizationId, role: 'OWNER', userId: { not: session.user.id } },
        orderBy: { createdAt: 'asc' },
        select: { userId: true },
      })
      // Always found: an organisation others are in has an OWNER besides
      // this account, or it would have been refused above as blocking. An
      // organisation this account has left always kept one.
      if (heir) await prisma.vehicle.update({ where: { id: v.id }, data: { ownerId: heir.userId, slug: null } })
    }

    // An organisation nobody else is in goes with the account, vehicles and
    // all — including any a former member left on record there.
    const soloVehicles = orgs.solo.length
      ? await prisma.vehicle.findMany({ where: { organizationId: { in: orgs.solo } }, select: { id: true, ownerId: true } })
      : []
    const keys = [
      ...(await collectStorageKeys(session.user.id)),
      ...(await Promise.all(soloVehicles.map((v) => collectStorageKeys(v.ownerId, v.id)))).flat(),
    ]
    await prisma.$transaction([
      prisma.vehicle.deleteMany({ where: { organizationId: { in: orgs.solo } } }),
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
