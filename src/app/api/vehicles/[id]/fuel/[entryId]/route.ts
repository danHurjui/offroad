import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { deleteUpload } from '@/lib/storage'

/**
 * Removing a fill-up. Owner: any; collaborator: their own (pitfall #4).
 *
 * It takes its receipt file and the odometer reading it created with it —
 * a fill-up deleted because it was typed wrong almost always had the wrong
 * km too. The file goes after the rows, best effort: a storage hiccup must
 * not leave the entry undeletable (deleteUpload swallows a missing file).
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const entry = await prisma.fuelEntry.findUnique({ where: { id: params.entryId } })
  if (!entry || entry.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && entry.createdByUserId !== session.user.id) {
    return await apiError('fuelOwnOnly', 403)
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.fuelEntry.delete({ where: { id: entry.id } })
      if (entry.odometerReadingId) {
        await tx.odometerReading.deleteMany({ where: { id: entry.odometerReadingId, source: 'FUEL' } })
      }
    })
  } catch {
    return await apiError('internalError', 500)
  }
  if (entry.receiptUrl) {
    await deleteUpload(entry.receiptUrl).catch((e) => console.error('[fuel] receipt file not removed', e))
  }
  return NextResponse.json({ ok: true })
}
