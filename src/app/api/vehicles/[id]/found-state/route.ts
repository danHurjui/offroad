import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { toNumberOrNull } from '@/lib/serialize'
import { readJsonBody } from '@/lib/requestBody'
import { invalidAmountResponse } from '@/lib/amounts'
import { syncFoundStateReading } from '@/lib/odometerRecords'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

/**
 * #105: the acquisition date and price paid are the vehicle's
 * (`purchaseDate` / `purchasePriceRon`) — the intake reads and writes them
 * there, and its responses carry them under their old names so the form
 * and any client keep working. RL-031/RL-040: the price paid is a cost
 * like any other, so it is null for someone who cannot see costs.
 */
function withPurchase<T extends object>(
  foundState: T,
  vehicle: Parameters<typeof hidesCosts>[0] & { purchaseDate: Date | null; purchasePriceRon: Prisma.Decimal | null }
) {
  return {
    ...foundState,
    acquisitionDate: vehicle.purchaseDate,
    purchasePriceRon: hidesCosts(vehicle) ? null : toNumberOrNull(vehicle.purchasePriceRon),
  }
}

// RL-008: found state intake — restoration mode only, editable after creation.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  if (vehicle.projectType !== 'RESTORATION') {
    return await apiError('foundStateRestorationOnly', 400)
  }

  const foundState = await prisma.foundState.findUnique({
    where: { vehicleId: vehicle.id },
    include: { photos: true },
  })
  if (!foundState) return NextResponse.json(null)

  return NextResponse.json(withPurchase(foundState, vehicle))
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const readOnly = await refuseIfReadOnly(vehicle)
  if (readOnly) return readOnly
  if (vehicle.projectType !== 'RESTORATION') {
    return await apiError('foundStateRestorationOnly', 400)
  }

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const {
      acquisitionDate,
      purchasePriceRon,
      odometer,
      knownHistory,
      conditionRating,
      frontNotes,
      rearNotes,
      leftNotes,
      rightNotes,
      roofNotes,
      floorNotes,
      engineNotes,
      interiorNotes,
    } = body

    if (!acquisitionDate || Number.isNaN(new Date(acquisitionDate).getTime())) {
      return await apiError('acquisitionDateRequired', 400)
    }
    const badAmount = await invalidAmountResponse({ purchasePriceRon, odometer })
    if (badAmount) return badAmount
    if (conditionRating !== undefined && conditionRating !== null) {
      const rating = Number(conditionRating)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return await apiError('conditionRatingRange', 400)
      }
    }

    const acquiredOn = new Date(acquisitionDate)
    // Someone who cannot see costs was shown no price, so what their form
    // sends back for it means nothing: the stored price is left alone.
    const purchase = hidesCosts(vehicle)
      ? { purchaseDate: acquiredOn }
      : { purchaseDate: acquiredOn, purchasePriceRon: purchasePriceRon != null ? Number(purchasePriceRon) : null }
    const data = {
      odometer: odometer != null ? Number(odometer) : null,
      knownHistory: knownHistory || null,
      conditionRating: conditionRating != null ? Number(conditionRating) : null,
      frontNotes: frontNotes || null,
      rearNotes: rearNotes || null,
      leftNotes: leftNotes || null,
      rightNotes: rightNotes || null,
      roofNotes: roofNotes || null,
      floorNotes: floorNotes || null,
      engineNotes: engineNotes || null,
      interiorNotes: interiorNotes || null,
    }

    // #105: the purchase is written to the vehicle only.
    const [foundState, updatedVehicle] = await prisma.$transaction(async (tx) => {
      const row = await tx.foundState.upsert({
        where: { vehicleId: vehicle.id },
        create: { vehicleId: vehicle.id, ...data },
        update: data,
        include: { photos: true },
      })
      const saved = await tx.vehicle.update({
        where: { id: vehicle.id },
        data: purchase,
        select: { purchaseDate: true, purchasePriceRon: true },
      })
      return [row, saved] as const
    })
    // RL-044: one mileage history, not a snapshot beside it.
    await syncFoundStateReading({
      vehicleId: vehicle.id,
      km: foundState.odometer,
      acquisitionDate: acquiredOn,
      userId: session.user.id,
    })

    return NextResponse.json(withPurchase(foundState, { ...vehicle, ...updatedVehicle }))
  } catch {
    return await apiError('internalError', 500)
  }
}
