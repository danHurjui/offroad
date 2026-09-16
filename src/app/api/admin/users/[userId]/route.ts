import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'

/** Detail view for one user, with enough context to make a moderation call. */
export async function GET(_req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  try {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        username: true,
        location: true,
        isPro: true,
        proPlan: true,
        isAdmin: true,
        active: true,
        accountType: true,
        createdAt: true,
        vehicles: {
          select: { id: true, make: true, model: true, year: true, projectType: true, isPublic: true },
          orderBy: { createdAt: 'desc' },
        },
        tickets: {
          select: { id: true, title: true, type: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: { select: { vehicles: true, tickets: true, ticketComments: true, donations: true } },
      },
    })
    if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(user)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * The only user field an admin can change is `active` — the moderation
 * lever. Two things are deliberately *not* editable here:
 *
 * - **`isPro`**: the Stripe webhook is its only writer. Flipping it by
 *   hand would desync entitlement from what the customer actually paid
 *   for, and the next webhook would overwrite it anyway.
 * - **`isAdmin`**: granting admin from an API route means one compromised
 *   admin session can mint more admins. It stays a deliberate database
 *   change (see CLAUDE.md).
 *
 * Anything else in the body is ignored rather than merged, so this can't
 * become a mass-assignment hole as fields are added to User.
 */
export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error
  const { session } = auth

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, active: true, isAdmin: true, displayName: true },
  })
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  if (body.active === undefined) {
    return NextResponse.json({ error: 'Only `active` can be changed here' }, { status: 400 })
  }
  const active = Boolean(body.active)

  // Locking yourself out is the one mistake with no in-app way back.
  if (target.id === session.user.id && !active) {
    return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
  }
  // Admins don't get to depose each other; that needs database access, the
  // same bar as granting admin in the first place.
  if (target.isAdmin && !active) {
    return NextResponse.json(
      { error: 'An admin account cannot be deactivated from here' },
      { status: 400 }
    )
  }

  try {
    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { active },
      select: { id: true, displayName: true, email: true, active: true },
    })
    return NextResponse.json(updated)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
