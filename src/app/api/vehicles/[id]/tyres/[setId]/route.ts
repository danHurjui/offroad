import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { parseTyreSet } from '@/lib/tyres'
import { toNumberOrNull } from '@/lib/serialize'

/** Owner: any set. Collaborator: the sets they added (pitfall #4). */
async function load(vehicleId: string, setId: string, userId: string) {
  const vehicle = await requireVehicleAccess(vehicleId, userId)
  if (!vehicle) return { ok: false as const, error: await apiError('notFound', 404) }
  const set = await prisma.tyreSet.findUnique({ where: { id: setId } })
  if (!set || set.vehicleId !== vehicle.id) return { ok: false as const, error: await apiError('notFound', 404) }
  if (vehicle.ownerId !== userId && set.createdByUserId !== userId) {
    return { ok: false as const, error: await apiError('tyreOwnOnly', 403) }
  }
  return { ok: true as const, vehicle, set }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; setId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await load(params.id, params.setId, auth.session.user.id)
  if (!loaded.ok) return loaded.error

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const tyre = parseTyreSet(parsed.body, { requireSeason: false })
  if (!tyre.ok) return await apiErrorWith('tyreFieldInvalid', { field: tyre.field }, 400)

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (tyre.data.isFitted) {
        await tx.tyreSet.updateMany({ where: { vehicleId: loaded.vehicle.id, id: { not: loaded.set.id } }, data: { isFitted: false } })
      }
      return tx.tyreSet.update({ where: { id: loaded.set.id }, data: tyre.data })
    })
    return NextResponse.json({ ...updated, treadDepthMm: toNumberOrNull(updated.treadDepthMm) })
  } catch {
    return await apiError('internalError', 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; setId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await load(params.id, params.setId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  try {
    await prisma.tyreSet.delete({ where: { id: loaded.set.id } })
    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
