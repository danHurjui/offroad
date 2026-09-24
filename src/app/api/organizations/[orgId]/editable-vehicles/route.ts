import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import { accessForRole } from '@/lib/access'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { orgVehicleLimit } from '@/lib/plans'
import { chooseEditableVehicles, orgReadOnlyVehicleIds, parseEditableChoice } from '@/lib/vehicleAllowance'
import { loadMembership } from '../../load'

type Params = { params: { orgId: string } }

/**
 * RL-042 (#54): which company vehicles stay editable when the organisation
 * holds more than its plan covers. The people who manage the vehicles
 * (OWNER, FLEET_MANAGER) choose; at most the plan's allowance, and the
 * budget is the organisation's, so two managers cannot take turns.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await loadMembership(params.orgId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  if (accessForRole(loaded.role) !== 'owner') return await apiError('orgManagersOnly', 403)
  const org = loaded.membership.organization

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error

  const vehicles = await prisma.vehicle.findMany({ where: { organizationId: org.id }, select: { id: true } })
  const limit = orgVehicleLimit(org)
  const ids = parseEditableChoice(parsed.body, new Set(vehicles.map((v) => v.id)), limit)
  if (ids === null) return await apiError('invalidEditableChoice', 400)
  if (ids === 'tooMany') return await apiErrorWith('tooManyEditable', { limit: limit! }, 400)

  const rate = await consumeRateLimit('editableChoice', `org:${org.id}`)
  if (!rate.ok) return await rateLimitResponse(rate)

  try {
    await chooseEditableVehicles({ organizationId: org.id }, ids)
    return NextResponse.json({ readOnly: Array.from(await orgReadOnlyVehicleIds(org.id)) })
  } catch {
    return await apiError('internalError', 500)
  }
}
