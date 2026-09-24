import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { deleteUpload } from '@/lib/storage'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * Removing a charge. Owner: any; anyone else: their own (pitfall #4). It
 * takes the odometer reading it created and its receipt file with it,
 * exactly like a fill-up; the file goes after the rows, best effort.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const entry = await prisma.chargeEntry.findUnique({ where: { id: params.entryId } })
  if (!entry || entry.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && entry.createdByUserId !== session.user.id) {
    return await apiError('chargeOwnOnly', 403)
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.chargeEntry.delete({ where: { id: entry.id } })
      if (entry.odometerReadingId) {
        await tx.odometerReading.deleteMany({ where: { id: entry.odometerReadingId, source: 'CHARGE' } })
      }
    })
  } catch {
    return await apiError('internalError', 500)
  }
  if (entry.receiptUrl) {
    await deleteUpload(entry.receiptUrl).catch((e) => console.error('[charge] receipt file not removed', e))
  }
  return NextResponse.json({ ok: true })
}
