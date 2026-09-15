import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'

// RL-009: account deletion — deletes all user data via Prisma cascades
// (Vehicle -> Task -> TaskPhoto, FoundState, etc. all onDelete: Cascade
// from Vehicle; User -> Vehicle is also Cascade).
export async function DELETE() {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  try {
    await prisma.user.delete({ where: { id: session.user.id } })
    return NextResponse.json({ message: 'Account deleted' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
