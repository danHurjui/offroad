import { NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { collectStorageKeys, deleteStoredFiles } from '@/lib/personalData'

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
 */
export async function DELETE() {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  try {
    const keys = await collectStorageKeys(session.user.id)
    await prisma.user.delete({ where: { id: session.user.id } })
    // After the rows are gone, so a storage failure can't leave a
    // half-deleted account behind.
    await deleteStoredFiles(keys)
    return NextResponse.json({ message: 'Account deleted', filesDeleted: keys.length })
  } catch {
    return await apiError('internalError', 500)
  }
}
