import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { isBlockedAsUnverified, VERIFICATION_SELECT } from '@/lib/emailVerification'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleAccess, requireVehicleOwner } from '@/lib/access'
import { ensureUsername } from '@/lib/username'
import { generateVehicleSlug } from '@/lib/vehicleSlug'
import { serializeTaskFor, serializeVehicle, toNumberOrNull } from '@/lib/serialize'
import { readJsonBody } from '@/lib/requestBody'
import { collectStorageKeys, deleteStoredFiles } from '@/lib/personalData'
import { parseProfile } from '@/lib/vehicleProfile'
import { parseValues } from '@/lib/ownershipCosts'

const CURRENT_YEAR_PLUS_ONE = new Date().getFullYear() + 1

// RL-003: project dashboard reads the vehicle plus its tasks/found state.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  try {
    const [tasks, foundState] = await Promise.all([
      prisma.task.findMany({
        where: { vehicleId: vehicle.id },
        orderBy: { updatedAt: 'desc' },
        include: { photos: true },
      }),
      vehicle.projectType === 'RESTORATION'
        ? prisma.foundState.findUnique({ where: { vehicleId: vehicle.id }, include: { photos: true } })
        : Promise.resolve(null),
    ])
    // Costs are Decimal (pitfall #5) so they must go through serializeTask
    // to reach consumers as numbers, and RL-031's hideCostsFromCollaborators
    // has to be applied here rather than only in the pages that render them.
    const isOwner = vehicle.access === 'owner'
    const hideCosts = !isOwner && vehicle.hideCostsFromCollaborators
    return NextResponse.json({
      vehicle: serializeVehicle(vehicle, { hideCosts }),
      tasks: tasks.map((t) => serializeTaskFor(t, { hideCosts })),
      foundState,
      isOwner,
    })
  } catch {
    return await apiError('internalError', 500)
  }
}

// Vehicle settings edit — owner only. projectType is intentionally not
// editable here (see CLAUDE.md pitfall #2).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const data: Record<string, unknown> = {}

    if (body.make !== undefined) data.make = String(body.make)
    if (body.model !== undefined) data.model = String(body.model)
    if (body.year !== undefined) {
      const yearNum = Number(body.year)
      if (!Number.isInteger(yearNum) || yearNum < 1886 || yearNum > CURRENT_YEAR_PLUS_ONE) {
        return await apiError('yearInvalid', 400)
      }
      data.year = yearNum
    }
    if (body.generation !== undefined) data.generation = body.generation || null
    if (body.engine !== undefined) data.engine = body.engine || null
    if (body.vin !== undefined) data.vin = body.vin || null
    if (body.coverPhotoUrl !== undefined) data.coverPhotoUrl = body.coverPhotoUrl || null
    if (body.isPublic !== undefined) data.isPublic = Boolean(body.isPublic)
    if (body.hideCostsFromCollaborators !== undefined) data.hideCostsFromCollaborators = Boolean(body.hideCostsFromCollaborators)
    if (body.hidePublicCost !== undefined) data.hidePublicCost = Boolean(body.hidePublicCost)

    // RL-050: plate and registration. Only the fields sent are touched.
    const profile = parseProfile(body)
    if (!profile.ok) return await apiErrorWith('profileFieldInvalid', { field: profile.field }, 400)
    Object.assign(data, profile.data)

    // RL-045/RL-050: values and finance. The value is the owner's own
    // estimate; nothing here computes one.
    const values = parseValues(body, {
      financeStartDate: vehicle.financeStartDate,
      financeEndDate: vehicle.financeEndDate,
      currentValueRon: toNumberOrNull(vehicle.currentValueRon),
    })
    if (!values.ok) return await apiErrorWith('valuesFieldInvalid', { field: values.field }, 400)
    Object.assign(data, values.data)

    // Publishing is the one field on this route that reaches strangers:
    // it puts the build, its photos and (unless hidden) its costs on the
    // open web under a URL anyone can read. So the confirmed-address rule
    // applies to *this field* rather than to the whole route — everything
    // else here edits a private record, and refusing somebody the ability
    // to correct their own mileage over an unclicked link would be
    // punishing them for nothing.
    // RL-038: a company vehicle is never public — its page would sit under
    // one person's username. The database refuses it too (a CHECK).
    if (data.isPublic === true && vehicle.organizationId) return await apiError('companyVehicleNotPublic', 400)
    if (data.isPublic === true) {
      const owner = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: VERIFICATION_SELECT,
      })
      if (isBlockedAsUnverified(owner)) return await apiError('emailNotVerified', 403)
    }

    // RL-018: a vehicle/owner created before this ticket shipped might
    // still be missing a slug/username — backfill both the moment it's
    // switched public, since the public URL needs both.
    if (data.isPublic === true && !vehicle.slug) {
      const year = (data.year as number | undefined) ?? vehicle.year
      const make = (data.make as string | undefined) ?? vehicle.make
      const model = (data.model as string | undefined) ?? vehicle.model
      data.slug = await generateVehicleSlug(vehicle.ownerId, year, make, model)
    }
    if (data.isPublic === true) {
      await ensureUsername(vehicle.ownerId)
    }

    // A restoration's intake still carries its own copy of the purchase
    // (FoundState, until a later release drops it), so the two are kept
    // in step. Its acquisition date is required, so a cleared purchase
    // date leaves it alone.
    const mirror: Record<string, unknown> = {}
    if (values.data.purchasePriceRon !== undefined) mirror.purchasePriceRon = values.data.purchasePriceRon
    if (values.data.purchaseDate) mirror.acquisitionDate = values.data.purchaseDate
    const updated =
      vehicle.projectType === 'RESTORATION' && Object.keys(mirror).length > 0
        ? await prisma.$transaction(async (tx) => {
            const row = await tx.vehicle.update({ where: { id: vehicle.id }, data })
            await tx.foundState.updateMany({ where: { vehicleId: vehicle.id }, data: mirror })
            return row
          })
        : await prisma.vehicle.update({ where: { id: vehicle.id }, data })
    return NextResponse.json(serializeVehicle(updated))
  } catch {
    return await apiError('internalError', 500)
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  try {
    // Gathered before the delete — the rows that name these files are
    // about to cascade away, and the bytes would otherwise be orphaned in
    // Blob storage with no way left to find them.
    const keys = await collectStorageKeys(vehicle.ownerId, vehicle.id)
    await prisma.vehicle.delete({ where: { id: vehicle.id } })
    await deleteStoredFiles(keys)
    return NextResponse.json({ message: 'Vehicle deleted', filesDeleted: keys.length })
  } catch {
    return await apiError('internalError', 500)
  }
}
