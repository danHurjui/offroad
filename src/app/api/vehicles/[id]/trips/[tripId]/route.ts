import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { tripGate } from '@/lib/tripRecords'

/**
 * RL-051: remove a trip, and the two readings written with it — they were
 * the trip's km, not separate observations. A manager removes any; a
 * driver only their own. No Pro needed to remove, like withdrawing a
 * passport link: a lapsed plan must not trap a wrong entry.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; tripId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  if ((await tripGate(vehicle)) === 'forbidden') return await apiError('notFound', 404)

  const trip = await prisma.trip.findUnique({
    where: { id: params.tripId },
    select: { id: true, vehicleId: true, driverUserId: true, startReadingId: true, endReadingId: true },
  })
  if (!trip || trip.vehicleId !== vehicle.id) return await apiError('notFound', 404)
  if (vehicle.access !== 'owner' && trip.driverUserId !== session.user.id) return await apiError('notFound', 404)

  try {
    const readingIds = [trip.startReadingId, trip.endReadingId].filter((id): id is string => id !== null)
    await prisma.$transaction([
      prisma.trip.delete({ where: { id: trip.id } }),
      prisma.odometerReading.deleteMany({ where: { id: { in: readingIds }, vehicleId: vehicle.id, source: 'TRIP' } }),
    ])
    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
