import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { serializeWishlistItem } from '@/lib/serialize'
import { readJsonBody } from '@/lib/requestBody'
import { invalidAmountResponse } from '@/lib/amounts'

// RL-011 (off-road wishlist) / RL-012 (restoration parts hunt) — same
// entity, mode-specific status vocabulary and an extra partCondition
// field used only in restoration mode.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const items = await prisma.wishlistItem.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: { priority: 'asc' },
  })

  return NextResponse.json(items.map(serializeWishlistItem))
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const { name, category, estimatedCostRon, status, partCondition, supplierUrl, notes, hardToFind } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const badAmount = invalidAmountResponse({ estimatedCostRon })
    if (badAmount) return badAmount
    const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
    const resolvedStatus = status || config.wishlistStatuses[0].value
    if (!config.wishlistStatuses.some((s) => s.value === resolvedStatus)) {
      return NextResponse.json({ error: 'Invalid status for this project type' }, { status: 400 })
    }

    const maxPriority = await prisma.wishlistItem.aggregate({
      where: { vehicleId: vehicle.id },
      _max: { priority: true },
    })

    const item = await prisma.wishlistItem.create({
      data: {
        vehicleId: vehicle.id,
        name,
        category: category || null,
        estimatedCostRon: estimatedCostRon != null ? Number(estimatedCostRon) : null,
        priority: (maxPriority._max.priority ?? -1) + 1,
        status: resolvedStatus,
        partCondition: vehicle.projectType === 'RESTORATION' ? partCondition || null : null,
        supplierUrl: supplierUrl || null,
        notes: notes || null,
        hardToFind: Boolean(hardToFind),
      },
    })

    return NextResponse.json(serializeWishlistItem(item), { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
