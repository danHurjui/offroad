import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'

// RL-011/012: drag-to-reorder. Body: { orderedIds: string[] } — every id
// in the vehicle's wishlist, in the new order. priority is set to array
// index; anything not owned by this vehicle is rejected outright rather
// than silently skipped, so a stale client can't corrupt another user's
// item ordering via a mismatched id.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const body = await req.json()
    const orderedIds = body.orderedIds
    if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'orderedIds must be an array of strings' }, { status: 400 })
    }

    const existing = await prisma.wishlistItem.findMany({
      where: { vehicleId: vehicle.id },
      select: { id: true },
    })
    const existingIds = new Set(existing.map((i) => i.id))
    if (orderedIds.length !== existingIds.size || orderedIds.some((id) => !existingIds.has(id))) {
      return NextResponse.json({ error: 'orderedIds must match this vehicle\'s wishlist exactly' }, { status: 400 })
    }

    await prisma.$transaction(
      orderedIds.map((id: string, index: number) =>
        prisma.wishlistItem.update({ where: { id }, data: { priority: index } })
      )
    )

    return NextResponse.json({ message: 'Reordered' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
