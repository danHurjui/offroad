import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { hasPro, PRO_SELECT } from '@/lib/pro'
import { newPassportToken } from '@/lib/passportRecords'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * RL-049: share the passport. Owner only and Pro. One live link per
 * vehicle: making a new one withdraws the old in the same transaction, so
 * changing what the link shows (adding the plate, say) never leaves an
 * older, differently-scoped link still readable.
 *
 * Plate and VIN are off unless asked for — both identify the vehicle
 * (RL-050). Costs are on unless switched off.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT } })
  if (!hasPro(owner)) return await apiError('proPassport', 403, { code: 'UPGRADE_REQUIRED' })

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const link = await prisma.$transaction(async (tx) => {
      await tx.passportLink.updateMany({ where: { vehicleId: vehicle.id, revokedAt: null }, data: { revokedAt: new Date() } })
      return tx.passportLink.create({
        data: {
          vehicleId: vehicle.id,
          token: newPassportToken(),
          showPlate: body.showPlate === true,
          showVin: body.showVin === true,
          showCosts: body.showCosts !== false,
        },
      })
    })
    return NextResponse.json(link, { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
