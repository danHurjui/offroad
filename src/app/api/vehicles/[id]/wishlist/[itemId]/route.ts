import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { serializeWishlistItem } from '@/lib/serialize'

async function loadItem(vehicleId: string, itemId: string) {
  const item = await prisma.wishlistItem.findUnique({ where: { id: itemId } })
  if (!item || item.vehicleId !== vehicleId) return null
  return item
}

export async function GET(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await loadItem(params.id, params.itemId)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(serializeWishlistItem(item))
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await loadItem(params.id, params.itemId)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const body = await req.json()
    const data: Record<string, unknown> = {}
    const config = PROJECT_TYPE_CONFIG[vehicle.projectType]

    if (body.name !== undefined) {
      if (!body.name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      data.name = String(body.name)
    }
    if (body.category !== undefined) data.category = body.category || null
    if (body.estimatedCostRon !== undefined) {
      data.estimatedCostRon = body.estimatedCostRon != null ? Number(body.estimatedCostRon) : null
    }
    if (body.status !== undefined) {
      if (!config.wishlistStatuses.some((s) => s.value === body.status)) {
        return NextResponse.json({ error: 'Invalid status for this project type' }, { status: 400 })
      }
      data.status = body.status
    }
    if (body.partCondition !== undefined) {
      data.partCondition = vehicle.projectType === 'RESTORATION' ? body.partCondition || null : null
    }
    if (body.supplierUrl !== undefined) data.supplierUrl = body.supplierUrl || null
    if (body.notes !== undefined) data.notes = body.notes || null
    if (body.hardToFind !== undefined) data.hardToFind = Boolean(body.hardToFind)

    const updated = await prisma.wishlistItem.update({ where: { id: item.id }, data })
    return NextResponse.json(serializeWishlistItem(updated))
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await loadItem(params.id, params.itemId)
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    await prisma.wishlistItem.delete({ where: { id: item.id } })
    return NextResponse.json({ message: 'Item deleted' })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
