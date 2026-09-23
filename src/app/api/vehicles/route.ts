import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { listAccessibleVehicles } from '@/lib/access'
import { requireSession } from '@/lib/authz'
import { isProjectType, PROJECT_TYPES } from '@/lib/projectType'
import { generateVehicleSlug } from '@/lib/vehicleSlug'
import { readJsonBody } from '@/lib/requestBody'
import { hasPro, PRO_SELECT, FREE_TIER } from '@/lib/pro'
import { parseProfile } from '@/lib/vehicleProfile'
import { serializeVehicle } from '@/lib/serialize'

const CURRENT_YEAR_PLUS_ONE = new Date().getFullYear() + 1

// RL-002: create a vehicle / project.
export async function GET() {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  try {
    // RL-038: `owned` is every vehicle the caller has owner access to —
    // their personal ones and company ones they manage.
    const all = await listAccessibleVehicles(session.user.id)
    return NextResponse.json({
      owned: all.filter((v) => v.access === 'owner').map(({ access: _a, ...v }) => serializeVehicle(v)),
      collaborating: all
        .filter((v) => v.access === 'collaborator')
        .map(({ access: _a, ...v }) => serializeVehicle(v, { hideCosts: v.hideCostsFromCollaborators })),
    })
  } catch {
    return await apiError('internalError', 500)
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
      return await apiErrorWith('projectTypeInvalid', { types: PROJECT_TYPES.join(', ') }, 400)
    }
    if (!make || typeof make !== 'string') {
      return await apiError('makeRequired', 400)
    }
    if (!model || typeof model !== 'string') {
      return await apiError('modelRequired', 400)
    }
    const yearNum = Number(year)
    if (!Number.isInteger(yearNum) || yearNum < 1886 || yearNum > CURRENT_YEAR_PLUS_ONE) {
      return await apiError('yearInvalid', 400)
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { ...PRO_SELECT },
    })
    if (!hasPro(user)) {
      const existingCount = await prisma.vehicle.count({ where: { ownerId: session.user.id, organizationId: null } })
      if (existingCount >= FREE_TIER.vehicles) {
        return await apiErrorWith(
          'vehicleLimit',
          { limit: FREE_TIER.vehicles },
          403,
          { code: 'UPGRADE_REQUIRED' }
        )
      }
    }

    // RL-050: the create form offers the plate; the rest of the profile
    // is accepted here too so an import or a future form needs no change.
    const profile = parseProfile(body)
    if (!profile.ok) return await apiErrorWith('profileFieldInvalid', { field: profile.field }, 400)

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
        ...profile.data,
      },
    })

    return NextResponse.json(serializeVehicle(vehicle), { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
