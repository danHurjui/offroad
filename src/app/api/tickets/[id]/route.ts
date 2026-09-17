import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import {
  isTicketStatus,
  validateText,
  TICKET_TITLE_MAX,
  TICKET_DESCRIPTION_MAX,
} from '@/lib/tickets'

/** Ticket detail. Public, like the listing. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: params.id },
      include: {
        author: { select: { displayName: true } },
        _count: { select: { votes: true } },
      },
    })
    if (!ticket) return await apiError('notFound', 404)

    return NextResponse.json({
      id: ticket.id,
      type: ticket.type,
      status: ticket.status,
      title: ticket.title,
      description: ticket.description,
      adminNote: ticket.adminNote,
      authorName: ticket.author.displayName,
      voteCount: ticket._count.votes,
      createdAt: ticket.createdAt,
    })
  } catch {
    return await apiError('internalError', 500)
  }
}

/**
 * Two distinct edit paths on one route, with different permissions:
 *
 *  - the **author** may correct their own title/description
 *  - an **admin** may set status/adminNote (triage)
 *
 * They are checked separately on purpose. An author must never be able to
 * move their own ticket to PLANNED, and an admin editing triage fields
 * shouldn't silently rewrite someone else's words.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true },
  })
  if (!ticket) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isAdmin: true },
    })
    const isAdmin = Boolean(user?.isAdmin)
    const isAuthor = ticket.authorId === session.user.id

    const data: Record<string, unknown> = {}

    if (body.title !== undefined || body.description !== undefined) {
      if (!isAuthor) {
        return await apiError('onlyTicketAuthor', 403)
      }
      if (body.title !== undefined) {
        const title = validateText(body.title, 'title', TICKET_TITLE_MAX)
        if (!title.ok) return NextResponse.json({ error: title.error }, { status: 400 })
        data.title = title.value
      }
      if (body.description !== undefined) {
        const description = validateText(body.description, 'description', TICKET_DESCRIPTION_MAX)
        if (!description.ok) return NextResponse.json({ error: description.error }, { status: 400 })
        data.description = description.value
      }
    }

    if (body.status !== undefined || body.adminNote !== undefined) {
      if (!isAdmin) {
        return await apiError('onlyAdminTriage', 403)
      }
      if (body.status !== undefined) {
        if (!isTicketStatus(body.status)) {
          return await apiError('invalidStatus', 400)
        }
        data.status = body.status
      }
      if (body.adminNote !== undefined) {
        data.adminNote = body.adminNote ? String(body.adminNote).trim().slice(0, 1000) : null
      }
    }

    if (Object.keys(data).length === 0) {
      return await apiError('nothingToUpdate', 400)
    }

    const updated = await prisma.ticket.update({ where: { id: ticket.id }, data })
    return NextResponse.json({
      id: updated.id,
      type: updated.type,
      status: updated.status,
      title: updated.title,
      description: updated.description,
      adminNote: updated.adminNote,
    })
  } catch {
    return await apiError('internalError', 500)
  }
}

/** The author may withdraw their own ticket; an admin may remove any. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    select: { id: true, authorId: true },
  })
  if (!ticket) return await apiError('notFound', 404)

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  })
  if (ticket.authorId !== session.user.id && !user?.isAdmin) {
    return await apiError('notFound', 404)
  }

  try {
    await prisma.ticket.delete({ where: { id: ticket.id } })
    return NextResponse.json({ message: 'Ticket deleted' })
  } catch {
    return await apiError('internalError', 500)
  }
}
