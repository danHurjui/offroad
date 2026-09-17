import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'

/**
 * Toggle this user's vote on a ticket.
 *
 * One vote per user is enforced by the `@@unique([ticketId, userId])` on
 * TicketVote, not by reading first and then writing — a read-then-write
 * check races against a second concurrent request from the same user and
 * would let a double-click (or a scripted burst) register two votes. Here
 * the second insert simply violates the constraint, which is caught as
 * "already voted" and turned into the un-vote half of the toggle.
 *
 * Votes require a session so they're attributable; there is deliberately
 * no anonymous voting, which would be trivially ballot-stuffed.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const ticket = await prisma.ticket.findUnique({ where: { id: params.id }, select: { id: true } })
  if (!ticket) return await apiError('notFound', 404)

  let voted: boolean
  try {
    await prisma.ticketVote.create({ data: { ticketId: ticket.id, userId: session.user.id } })
    voted = true
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // Already voted — the toggle removes it. deleteMany (not delete) so a
      // concurrent duplicate request that already removed the row resolves
      // to a no-op instead of throwing P2025.
      await prisma.ticketVote.deleteMany({ where: { ticketId: ticket.id, userId: session.user.id } })
      voted = false
    } else {
      return await apiError('internalError', 500)
    }
  }

  const voteCount = await prisma.ticketVote.count({ where: { ticketId: ticket.id } })
  return NextResponse.json({ voted, voteCount })
}
