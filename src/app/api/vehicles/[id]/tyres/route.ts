import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { parseTyreSet } from '@/lib/tyres'
import { toNumberOrNull } from '@/lib/serialize'

/**
 * RL-050 tyres. Owner or active collaborator — the mechanic swapping the
 * winter set on is exactly who should record it. Fitting a set unfits the
 * others in the same transaction: a car wears one set at a time.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const tyre = parseTyreSet(parsed.body, { requireSeason: true })
  if (!tyre.ok) return await apiErrorWith('tyreFieldInvalid', { field: tyre.field }, 400)
  const { season, ...rest } = tyre.data

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (rest.isFitted) await tx.tyreSet.updateMany({ where: { vehicleId: vehicle.id }, data: { isFitted: false } })
      return tx.tyreSet.create({
        data: { vehicleId: vehicle.id, season: season!, ...rest, createdByUserId: session.user.id },
      })
    })
    return NextResponse.json({ ...created, treadDepthMm: toNumberOrNull(created.treadDepthMm) }, { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
