import { apiError } from '@/lib/apiError'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'

/** Owner: any record. Collaborator: the records they added (pitfall #4). */
export async function loadAccident(vehicleId: string, accidentId: string, userId: string) {
  const vehicle = await requireVehicleAccess(vehicleId, userId)
  if (!vehicle) return { ok: false as const, error: await apiError('notFound', 404) }
  const accident = await prisma.accident.findUnique({ where: { id: accidentId }, include: { photos: true } })
  if (!accident || accident.vehicleId !== vehicle.id) return { ok: false as const, error: await apiError('notFound', 404) }
  if (vehicle.access !== 'owner' && accident.createdByUserId !== userId) {
    return { ok: false as const, error: await apiError('accidentOwnOnly', 403) }
  }
  return { ok: true as const, vehicle, accident }
}
