import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { readJsonBody } from '@/lib/requestBody'
import { ASSIGNMENT_NOTE_MAX } from '@/lib/assignments'

type Params = { params: { id: string } }

/** RL-040: who has driven this company vehicle, newest first. Managers only. */
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const vehicle = await requireVehicleOwner(params.id, auth.session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  const assignments = await prisma.vehicleAssignment.findMany({
    where: { vehicleId: vehicle.id },
    include: { driver: { select: { displayName: true } } },
    orderBy: { startedAt: 'desc' },
  })
  return NextResponse.json(assignments)
}

/**
 * Assigns the vehicle to a DRIVER of its organisation, from now. Managers
 * only. A vehicle with an active driver is refused by the database (the
 * one-active index), not by a read before the write — end the current
 * assignment first.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth
  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  if (!vehicle.organizationId) return await apiError('vehicleNotCompany', 400)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const driverUserId = typeof parsed.body.driverUserId === 'string' ? parsed.body.driverUserId : ''
  const note = typeof parsed.body.note === 'string' ? parsed.body.note.trim().slice(0, ASSIGNMENT_NOTE_MAX) || null : null

  const member = driverUserId
    ? await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: vehicle.organizationId, userId: driverUserId } },
        select: { role: true },
      })
    : null
  if (member?.role !== 'DRIVER') return await apiError('assignDriverOnly', 400)

  try {
    const assignment = await prisma.vehicleAssignment.create({
      data: { vehicleId: vehicle.id, driverUserId, note, assignedByUserId: session.user.id },
    })
    return NextResponse.json(assignment, { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return await apiError('vehicleAlreadyAssigned', 409)
    }
    return await apiError('internalError', 500)
  }
}
