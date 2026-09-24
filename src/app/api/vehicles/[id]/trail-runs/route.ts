import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { serializeTrailRun } from '@/lib/serialize'
import { readJsonBody } from '@/lib/requestBody'
import { invalidAmountResponse } from '@/lib/amounts'
import { hasPro, PRO_SELECT } from '@/lib/pro'
import { refuseIfReadOnly } from '@/lib/vehicleAllowance'

// RL-027: trail log — off-road mode only, Pro-gated, owner-only (like
// wishlist/documents — this is a personal driving log, not shared build
// documentation collaborators need to edit).
async function loadOffroadOwnerVehicle(vehicleId: string, userId: string) {
  const vehicle = await requireVehicleOwner(vehicleId, userId)
  if (!vehicle) return { error: await apiError('notFound', 404) }
  if (vehicle.projectType !== 'OFFROAD') {
    return { error: await apiError('trailOffroadOnly', 400) }
  }
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { ...PRO_SELECT } })
  if (!hasPro(owner)) {
    return { error: await apiError('proTrailLog', 403, { code: 'UPGRADE_REQUIRED' }) }
  }
  return { vehicle }
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const { vehicle, error } = await loadOffroadOwnerVehicle(params.id, session.user.id)
  if (error) return error

  const runs = await prisma.trailRun.findMany({
    where: { vehicleId: vehicle!.id },
    orderBy: { date: 'desc' },
    include: { waypoints: true },
  })
  return NextResponse.json(runs.map(serializeTrailRun))
}

interface TrackPointInput {
  lat: number
  lng: number
  altitude?: number | null
  timestamp: number
}
interface WaypointInput {
  lat: number
  lng: number
  note?: string
  recordedAt: string
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const { vehicle, error } = await loadOffroadOwnerVehicle(params.id, session.user.id)
  if (error) return error
  const readOnly = await refuseIfReadOnly(vehicle!)
  if (readOnly) return readOnly

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const { name, date, location, notes, distanceKm, durationMin, elevationGainM, trackGeoJson, waypoints } = body

    if (!name || typeof name !== 'string') {
      return await apiError('nameRequired', 400)
    }
    if (!date || Number.isNaN(new Date(date).getTime())) {
      return await apiError('validDateRequired', 400)
    }

    const badAmount = await invalidAmountResponse({ distanceKm, durationMin, elevationGainM })
    if (badAmount) return badAmount

    const track: TrackPointInput[] = Array.isArray(trackGeoJson) ? trackGeoJson : []
    const waypointInputs: WaypointInput[] = Array.isArray(waypoints) ? waypoints : []

    const run = await prisma.trailRun.create({
      data: {
        vehicleId: vehicle!.id,
        name,
        date: new Date(date),
        location: location || null,
        notes: notes || null,
        distanceKm: distanceKm != null ? Number(distanceKm) : null,
        durationMin: durationMin != null ? Number(durationMin) : null,
        elevationGainM: elevationGainM != null ? Number(elevationGainM) : null,
        trackGeoJson: (track.length > 0 ? track : undefined) as Prisma.InputJsonValue | undefined,
        waypoints: {
          create: waypointInputs.map((w) => ({
            lat: Number(w.lat),
            lng: Number(w.lng),
            note: w.note || null,
            recordedAt: new Date(w.recordedAt),
          })),
        },
      },
      include: { waypoints: true },
    })

    return NextResponse.json(serializeTrailRun(run), { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
