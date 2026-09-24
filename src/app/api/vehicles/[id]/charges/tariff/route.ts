import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { parseTariff } from '@/lib/charging'
import { toNumberOrNull } from '@/lib/serialize'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * RL-053: the owner's home tariff, RON per kWh — a vehicle setting, so
 * owner-only (pitfall #4). Changing it prices only the charges entered
 * afterwards: each charge stores the total it was given, and a blank
 * clears the tariff.
 */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const vehicle = await requireVehicleOwner(params.id, auth.session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const tariff = parseTariff(parsed.body.homeTariffRonPerKwh)
  if (!tariff.ok) return await apiError('chargeTariffInvalid', 400)

  try {
    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: { homeTariffRonPerKwh: tariff.value },
      select: { homeTariffRonPerKwh: true },
    })
    return NextResponse.json({ homeTariffRonPerKwh: toNumberOrNull(updated.homeTariffRonPerKwh) })
  } catch {
    return await apiError('internalError', 500)
  }
}
