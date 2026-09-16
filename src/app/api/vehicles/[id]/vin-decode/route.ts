import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { decodeVin, type DecodedVin } from '@/lib/vinDecoder'
import { readJsonBody } from '@/lib/requestBody'

function toJsonInput(decoded: DecodedVin): Prisma.InputJsonValue {
  return decoded as unknown as Prisma.InputJsonValue
}

async function loadRestorationOwnerVehicle(vehicleId: string, userId: string) {
  const vehicle = await requireVehicleOwner(vehicleId, userId)
  if (!vehicle) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (vehicle.projectType !== 'RESTORATION') {
    return { error: NextResponse.json({ error: 'VIN decoding only applies to restoration projects' }, { status: 400 }) }
  }
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { isPro: true } })
  if (!owner?.isPro) {
    return {
      error: NextResponse.json({ error: 'VIN decoding is a Pro feature.', code: 'UPGRADE_REQUIRED' }, { status: 403 }),
    }
  }
  return { vehicle }
}

// RL-028: attempts to decode vehicle.vin (local Dacia table, then NHTSA
// vPIC) and persists the result. Returns { decoded: null } — not an
// error — when neither path can decode it, so the client shows the
// manual-entry fallback instead of an error state.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const { vehicle, error } = await loadRestorationOwnerVehicle(params.id, session.user.id)
  if (error) return error

  if (!vehicle!.vin) {
    return NextResponse.json({ error: 'This vehicle has no VIN on file yet.' }, { status: 400 })
  }

  const result = await decodeVin(vehicle!.vin, vehicle!.year)
  if (!result) return NextResponse.json({ decoded: null })

  await prisma.vehicle.update({
    where: { id: vehicle!.id },
    data: { vinDecoded: toJsonInput(result.decoded), vinDecodeSource: result.source },
  })

  return NextResponse.json({ decoded: result.decoded, source: result.source })
}

// Manual-entry fallback (also usable to correct/augment a local/nhtsa
// decode) — always marks the result as source 'manual'.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const { vehicle, error } = await loadRestorationOwnerVehicle(params.id, session.user.id)
  if (error) return error

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const decoded: DecodedVin = {
      manufacturer: body.manufacturer || null,
      modelYear: body.modelYear != null && body.modelYear !== '' ? Number(body.modelYear) : null,
      factory: body.factory || null,
      engineCode: body.engineCode || null,
      bodyStyle: body.bodyStyle || null,
      colorCode: body.colorCode || null,
    }

    const updated = await prisma.vehicle.update({
      where: { id: vehicle!.id },
      data: { vinDecoded: toJsonInput(decoded), vinDecodeSource: 'manual' },
    })

    return NextResponse.json({ decoded: updated.vinDecoded, source: updated.vinDecodeSource })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
