import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { parseWarranty } from '@/lib/batteryHealth'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * RL-056: the traction-battery warranty — a vehicle setting, so owner-only
 * (pitfall #4). Both halves are sent every time; a blank clears one.
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
  const warranty = parseWarranty(parsed.body)
  if (!warranty.ok) return await apiError('batteryWarrantyInvalid', 400)

  try {
    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: warranty.value,
      select: { batteryWarrantyUntil: true, batteryWarrantyKm: true },
    })
    return NextResponse.json(updated)
  } catch {
    return await apiError('internalError', 500)
  }
}
