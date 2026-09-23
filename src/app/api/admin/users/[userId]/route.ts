import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
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
        isProComped: true,
        proCompedAt: true,
        proCompedReason: true,
        proCompedById: true,
        orgBetaAt: true,
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
    if (!user) return await apiError('notFound', 404)
    return NextResponse.json(user)
  } catch {
    return await apiError('internalError', 500)
  }
}

/**
 * An admin may change exactly three things here:
 *
 * - **`active`** — the moderation lever.
 * - **`isProComped`** — complimentary Pro.
 * - **`orgBeta`** — whether the account may create organisations (RL-038's
 *   closed beta, until the Business tier exists). Switching it off stops
 *   new organisations and leaves the existing ones alone.
 *
 * Two things remain deliberately *not* editable:
 *
 * - **`isPro`**: the Stripe webhook is its only writer. Writing it by hand
 *   would desync entitlement from what the customer actually paid, and
 *   the next webhook would overwrite it anyway. That's precisely why a
 *   comp is a separate column — see src/lib/pro.ts.
 * - **`isAdmin`**: granting admin from an API route means one compromised
 *   admin session can mint more admins. It stays a deliberate database
 *   change (see CLAUDE.md).
 *
 * Only the recognised fields are copied onto the update; the rest of the
 * body is ignored rather than merged, so this can't become a
 * mass-assignment hole as fields are added to User.
 */
export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error
  const { session } = auth

  const target = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, active: true, isAdmin: true, displayName: true },
  })
  if (!target) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  const wantsActive = body.active !== undefined
  const wantsComp = body.isProComped !== undefined
  const wantsOrgBeta = body.orgBeta !== undefined
  if (!wantsActive && !wantsComp && !wantsOrgBeta) {
    return await apiError('adminFieldsLimited', 400)
  }

  const data: Record<string, unknown> = {}

  if (wantsActive) {
    const active = Boolean(body.active)
    // Locking yourself out is the one mistake with no in-app way back.
    if (target.id === session.user.id && !active) {
      return await apiError('cannotDeactivateSelf', 400)
    }
    // Admins don't get to depose each other; that needs database access,
    // the same bar as granting admin in the first place.
    if (target.isAdmin && !active) {
      return await apiError('cannotDeactivateAdmin', 400)
    }
    data.active = active
  }

  if (wantsComp) {
    const isProComped = Boolean(body.isProComped)
    data.isProComped = isProComped
    // Granting records who and why, for accountability; revoking clears
    // the lot so a stale reason can't be read as a live justification.
    if (isProComped) {
      const reason = typeof body.proCompedReason === 'string' ? body.proCompedReason.trim().slice(0, 500) : ''
      data.proCompedAt = new Date()
      data.proCompedById = session.user.id
      data.proCompedReason = reason || null
    } else {
      data.proCompedAt = null
      data.proCompedById = null
      data.proCompedReason = null
    }
  }

  if (wantsOrgBeta) {
    data.orgBetaAt = body.orgBeta ? new Date() : null
  }

  try {
    const updated = await prisma.user.update({
      where: { id: target.id },
      data,
      select: {
        id: true, displayName: true, email: true, active: true,
        isPro: true, isProComped: true, proCompedAt: true, proCompedReason: true, orgBetaAt: true,
      },
    })
    return NextResponse.json(updated)
  } catch {
    return await apiError('internalError', 500)
  }
}
