import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { PLAN_SELECT, vehicleLimit } from '@/lib/plans'
import { chooseEditableVehicles, parseEditableChoice, readOnlyVehicleIds } from '@/lib/vehicleAllowance'

/**
 * RL-042 (#54): which of the account's personal vehicles stay editable
 * when it holds more than its plan covers. `vehicleIds` is the whole
 * choice, at most the plan's allowance; the rest go back to "oldest
 * first". Company vehicles are chosen by the organisation instead.
 */
export async function PUT(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const userId = auth.session.user.id

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error

  const [user, personal] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: PLAN_SELECT }),
    prisma.vehicle.findMany({ where: { ownerId: userId, organizationId: null }, select: { id: true } }),
  ])
  const limit = vehicleLimit(user)
  const ids = parseEditableChoice(parsed.body, new Set(personal.map((v) => v.id)), limit)
  if (ids === null) return await apiError('invalidEditableChoice', 400)
  if (ids === 'tooMany') return await apiErrorWith('tooManyEditable', { limit: limit! }, 400)

  const rate = await consumeRateLimit('editableChoice', `user:${userId}`)
  if (!rate.ok) return await rateLimitResponse(rate)

  try {
    await chooseEditableVehicles({ ownerId: userId, organizationId: null }, ids)
    return NextResponse.json({ readOnly: Array.from(await readOnlyVehicleIds(userId)) })
  } catch {
    return await apiError('internalError', 500)
  }
}
