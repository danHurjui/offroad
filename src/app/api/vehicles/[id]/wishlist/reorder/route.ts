import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { readJsonBody } from '@/lib/requestBody'

// RL-011/012: drag-to-reorder. Body: { orderedIds: string[] } — every id
// in the vehicle's wishlist, in the new order. priority is set to array
// index; anything not owned by this vehicle is rejected outright rather
// than silently skipped, so a stale client can't corrupt another user's
// item ordering via a mismatched id.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const orderedIds = body.orderedIds
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
      return await apiError('orderedIdsInvalid', 400)
    }

    const existing = await prisma.wishlistItem.findMany({
      where: { vehicleId: vehicle.id },
      select: { id: true },
    })
    const existingIds = new Set(existing.map((i) => i.id))
    if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
      return await apiError('orderedIdsMismatch', 400)
    }

    await prisma.$transaction(
      orderedIds.map((id: string, index: number) =>
        prisma.wishlistItem.update({ where: { id }, data: { priority: index } })
      )
    )

    return NextResponse.json({ message: 'Reordered' })
  } catch {
    return await apiError('internalError', 500)
  }
}
