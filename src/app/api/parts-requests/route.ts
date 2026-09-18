import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireVerifiedSession } from '@/lib/authz'
import { PART_CONDITIONS } from '@/lib/projectType'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { hasPro, PRO_SELECT } from '@/lib/pro'

// RL-024: community parts crowdsourcing. Pro only.
export async function POST(req: NextRequest) {
  // Reaches other people: this posts to the parts-wanted feed. A throwaway
  // address must not be able to do it — see requireVerifiedSession.
  const auth = await requireVerifiedSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  // Keyed on the user id, not the IP: a session id can't be rotated the
  // way a spoofed x-forwarded-for can.
  const limit = await consumeRateLimit('partsRequest', `user:${session.user.id}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT } })
  if (!hasPro(user)) {
    return await apiError('proPartsRequest', 403, { code: 'UPGRADE_REQUIRED' })
  }

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const vehicleMake = typeof body.vehicleMake === 'string' ? body.vehicleMake.trim() : ''
    const vehicleModel = typeof body.vehicleModel === 'string' ? body.vehicleModel.trim() : ''
    const partName = typeof body.partName === 'string' ? body.partName.trim() : ''
    const partNumber = typeof body.partNumber === 'string' ? body.partNumber.trim() : ''
    const conditionAccepted = typeof body.conditionAccepted === 'string' ? body.conditionAccepted : ''
    const location = typeof body.location === 'string' ? body.location.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''

    if (!vehicleMake || !vehicleModel) {
      return await apiError('vehicleMakeModelRequired', 400)
    }
    if (!partName) return await apiError('partNameRequired', 400)
    if (!PART_CONDITIONS.some((c) => c.value === conditionAccepted)) {
      return await apiError('invalidCondition', 400)
    }
    if (!location) return await apiError('locationRequired', 400)

    const partsRequest = await prisma.partsRequest.create({
      data: {
        userId: session.user.id,
        vehicleMake,
        vehicleModel,
        partName,
        partNumber: partNumber || null,
        conditionAccepted,
        location,
        description: description || null,
      },
    })

    return NextResponse.json(partsRequest, { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
