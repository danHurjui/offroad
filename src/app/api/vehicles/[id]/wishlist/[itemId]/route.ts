import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { serializeWishlistItem } from '@/lib/serialize'
import { readJsonBody } from '@/lib/requestBody'
import { invalidAmountResponse } from '@/lib/amounts'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

async function loadItem(vehicleId: string, itemId: string) {
  const item = await prisma.wishlistItem.findUnique({ where: { id: itemId } })
  if (!item || item.vehicleId !== vehicleId) return null
  return item
}

export async function GET(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const item = await loadItem(params.id, params.itemId)
  if (!item) return await apiError('notFound', 404)

  return NextResponse.json(serializeWishlistItem(item))
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const item = await loadItem(params.id, params.itemId)
  if (!item) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  const badAmount = await invalidAmountResponse({
    estimatedCostRon: body.estimatedCostRon,
    targetPriceRon: body.targetPriceRon,
  })
  if (badAmount) return badAmount

  try {
    const data: Record<string, unknown> = {}
    const config = PROJECT_TYPE_CONFIG[vehicle.projectType]

    if (body.name !== undefined) {
      if (!body.name) return await apiError('nameEmpty', 400)
      data.name = String(body.name)
    }
    if (body.category !== undefined) data.category = body.category || null
    if (body.estimatedCostRon !== undefined) {
      data.estimatedCostRon = body.estimatedCostRon != null ? Number(body.estimatedCostRon) : null
    }
    if (body.status !== undefined) {
      if (!config.wishlistStatuses.some((s) => s.value === body.status)) {
        return await apiError('invalidStatusForType', 400)
      }
      data.status = body.status
    }
    if (body.partCondition !== undefined) {
      data.partCondition = vehicle.projectType === 'RESTORATION' ? body.partCondition || null : null
    }
    if (body.supplierUrl !== undefined) data.supplierUrl = body.supplierUrl || null
    if (body.notes !== undefined) data.notes = body.notes || null
    if (body.hardToFind !== undefined) data.hardToFind = Boolean(body.hardToFind)
    // RL-026: changing the target price re-arms the alert (same
    // rearm-on-change idempotency pattern as Document.expiryDate).
    if (body.targetPriceRon !== undefined) {
      data.targetPriceRon = body.targetPriceRon != null ? Number(body.targetPriceRon) : null
      data.priceAlertSentAt = null
    }

    const updated = await prisma.wishlistItem.update({ where: { id: item.id }, data })
    return NextResponse.json(serializeWishlistItem(updated))
  } catch {
    return await apiError('internalError', 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly

  const item = await loadItem(params.id, params.itemId)
  if (!item) return await apiError('notFound', 404)

  try {
    await prisma.wishlistItem.delete({ where: { id: item.id } })
    return NextResponse.json({ message: 'Item deleted' })
  } catch {
    return await apiError('internalError', 500)
  }
}
