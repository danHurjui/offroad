import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { serializeTrailRun } from '@/lib/serialize'

// RL-027: trail log — off-road mode only, Pro-gated, owner-only (like
// wishlist/documents — this is a personal driving log, not shared build
// documentation collaborators need to edit).
async function loadOffroadOwnerVehicle(vehicleId: string, userId: string) {
  const vehicle = await requireVehicleOwner(vehicleId, userId)
  if (!vehicle) return { error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  if (vehicle.projectType !== 'OFFROAD') {
    return { error: NextResponse.json({ error: 'Trail log only applies to off-road projects' }, { status: 400 }) }
  }
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: { isPro: true } })
  if (!owner?.isPro) {
    return { error: NextResponse.json({ error: 'Trail log is a Pro feature.', code: 'UPGRADE_REQUIRED' }, { status: 403 }) }
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

  try {
    const body = await req.json()
    const { name, date, location, notes, distanceKm, durationMin, elevationGainM, trackGeoJson, waypoints } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (!date || Number.isNaN(new Date(date).getTime())) {
      return NextResponse.json({ error: 'A valid date is required' }, { status: 400 })
    }

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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
