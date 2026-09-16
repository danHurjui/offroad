import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { isProjectType, PROJECT_TYPES } from '@/lib/projectType'
import { generateVehicleSlug } from '@/lib/vehicleSlug'
import { readJsonBody } from '@/lib/requestBody'
import { hasPro, PRO_SELECT, FREE_TIER } from '@/lib/pro'

const CURRENT_YEAR_PLUS_ONE = new Date().getFullYear() + 1

// RL-002: create a vehicle / project.
export async function GET() {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  try {
    const owned = await prisma.vehicle.findMany({
      where: { ownerId: session.user.id },
      orderBy: { updatedAt: 'desc' },
    })
    const collaborating = await prisma.vehicle.findMany({
      where: { collaborators: { some: { collaboratorUserId: session.user.id, status: 'ACTIVE' } } },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json({ owned, collaborating })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const { projectType, make, model, year, generation, engine, vin, coverPhotoUrl } = body

    if (!isProjectType(projectType)) {
      return NextResponse.json(
        { error: `projectType must be one of: ${PROJECT_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
    if (!make || typeof make !== 'string') {
      return NextResponse.json({ error: 'make is required' }, { status: 400 })
    }
    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'model is required' }, { status: 400 })
    }
    const yearNum = Number(year)
    if (!Number.isInteger(yearNum) || yearNum < 1886 || yearNum > CURRENT_YEAR_PLUS_ONE) {
      return NextResponse.json({ error: 'year must be a valid 4-digit year' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { ...PRO_SELECT },
    })
    if (!hasPro(user)) {
      const existingCount = await prisma.vehicle.count({ where: { ownerId: session.user.id } })
      if (existingCount >= FREE_TIER.vehicles) {
        return NextResponse.json(
          {
            error: `Free tier is limited to ${FREE_TIER.vehicles} vehicle. Upgrade to Pro for unlimited vehicles.`,
            code: 'UPGRADE_REQUIRED',
          },
          { status: 403 }
        )
      }
    }

    const slug = await generateVehicleSlug(session.user.id, yearNum, make, model)

    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: session.user.id,
        projectType,
        make,
        model,
        year: yearNum,
        generation: generation || null,
        engine: engine || null,
        vin: vin || null,
        coverPhotoUrl: coverPhotoUrl || null,
        slug,
      },
    })

    return NextResponse.json(vehicle, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
