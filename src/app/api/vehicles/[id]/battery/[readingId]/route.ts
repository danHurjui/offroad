import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { deleteUpload } from '@/lib/storage'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * Removing a battery reading. Owner: any; anyone else: their own (pitfall
 * #4). Its report file goes after the row, best effort.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; readingId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const reading = await prisma.batteryHealthReading.findUnique({ where: { id: params.readingId } })
  if (!reading || reading.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && reading.createdByUserId !== session.user.id) {
    return await apiError('batteryOwnOnly', 403)
  }

  try {
    await prisma.batteryHealthReading.delete({ where: { id: reading.id } })
  } catch {
    return await apiError('internalError', 500)
  }
  if (reading.reportUrl) {
    await deleteUpload(reading.reportUrl).catch((e) => console.error('[battery] report file not removed', e))
  }
  return NextResponse.json({ ok: true })
}
