import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { parseAccident } from '@/lib/accidents'
import { toNumberOrNull } from '@/lib/serialize'

/**
 * RL-050 accidents and damage. Owner or active collaborator: the body shop
 * repairing it is well placed to record it. Free, like the rest of the
 * vehicle profile.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const accident = parseAccident(parsed.body, { create: true })
  if (!accident.ok) return await apiErrorWith('accidentFieldInvalid', { field: accident.field }, 400)
  const { date, kind, description, ...rest } = accident.data

  try {
    const created = await prisma.accident.create({
      data: { vehicleId: vehicle.id, date: date!, kind: kind!, description: description!, ...rest, createdByUserId: session.user.id },
    })
    return NextResponse.json({ ...created, repairCostRon: hidesCosts(vehicle) ? null : toNumberOrNull(created.repairCostRon) }, { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
