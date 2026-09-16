import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess } from '@/lib/access'
import { toNumberOrNull } from '@/lib/serialize'
import { readJsonBody } from '@/lib/requestBody'
import { invalidAmountResponse } from '@/lib/amounts'

// RL-008: found state intake — restoration mode only, editable after creation.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (vehicle.projectType !== 'RESTORATION') {
    return NextResponse.json({ error: 'Found state only applies to restoration projects' }, { status: 400 })
  }

  const foundState = await prisma.foundState.findUnique({
    where: { vehicleId: vehicle.id },
    include: { photos: true },
  })
  if (!foundState) return NextResponse.json(null)

  return NextResponse.json({ ...foundState, purchasePriceRon: toNumberOrNull(foundState.purchasePriceRon) })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (vehicle.projectType !== 'RESTORATION') {
    return NextResponse.json({ error: 'Found state only applies to restoration projects' }, { status: 400 })
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
      return NextResponse.json({ error: 'acquisitionDate is required' }, { status: 400 })
    }
    const badAmount = invalidAmountResponse({ purchasePriceRon, odometer })
    if (badAmount) return badAmount
    if (conditionRating !== undefined && conditionRating !== null) {
      const rating = Number(conditionRating)
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ error: 'conditionRating must be 1-5' }, { status: 400 })
      }
    }

    const data = {
      acquisitionDate: new Date(acquisitionDate),
      purchasePriceRon: purchasePriceRon != null ? Number(purchasePriceRon) : null,
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

    const foundState = await prisma.foundState.upsert({
      where: { vehicleId: vehicle.id },
      create: { vehicleId: vehicle.id, ...data },
      update: data,
      include: { photos: true },
    })

    return NextResponse.json({ ...foundState, purchasePriceRon: toNumberOrNull(foundState.purchasePriceRon) })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
