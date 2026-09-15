import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { PART_CONDITIONS } from '@/lib/projectType'

// RL-024: community parts crowdsourcing. Pro only.
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isPro: true } })
  if (!user?.isPro) {
    return NextResponse.json(
      { error: 'Posting a parts request is a Pro feature.', code: 'UPGRADE_REQUIRED' },
      { status: 403 }
    )
  }

  try {
    const body = await req.json()
    const vehicleMake = typeof body.vehicleMake === 'string' ? body.vehicleMake.trim() : ''
    const vehicleModel = typeof body.vehicleModel === 'string' ? body.vehicleModel.trim() : ''
    const partName = typeof body.partName === 'string' ? body.partName.trim() : ''
    const partNumber = typeof body.partNumber === 'string' ? body.partNumber.trim() : ''
    const conditionAccepted = typeof body.conditionAccepted === 'string' ? body.conditionAccepted : ''
    const location = typeof body.location === 'string' ? body.location.trim() : ''
    const description = typeof body.description === 'string' ? body.description.trim() : ''

    if (!vehicleMake || !vehicleModel) {
      return NextResponse.json({ error: 'vehicleMake and vehicleModel are required' }, { status: 400 })
    }
    if (!partName) return NextResponse.json({ error: 'partName is required' }, { status: 400 })
    if (!PART_CONDITIONS.some((c) => c.value === conditionAccepted)) {
      return NextResponse.json({ error: 'Invalid conditionAccepted' }, { status: 400 })
    }
    if (!location) return NextResponse.json({ error: 'location is required' }, { status: 400 })

    const partsRequest = await prisma.partsRequest.create({
      data: {
        userId: session.user.id,
        vehicleMake,
        vehicleModel,
        partName,
        partNumber: partNumber || null,
        conditionAccepted,
        location,
        description: description || null,
      },
    })

    return NextResponse.json(partsRequest, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
