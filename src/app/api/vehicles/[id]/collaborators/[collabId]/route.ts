import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'

// RL-030/031: revoke a collaborator's access. Owner only. We never delete
// the row — set status=REMOVED so past tasks/photos still show who added
// them (see Task.addedByUserId), and the "removed collaborator" tag in
// RL-032 can key off this status.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; collabId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const collaborator = await prisma.projectCollaborator.findUnique({ where: { id: params.collabId } })
  if (!collaborator || collaborator.vehicleId !== vehicle.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (collaborator.status === 'REMOVED') {
    return NextResponse.json({ error: 'Already removed' }, { status: 400 })
  }

  await prisma.projectCollaborator.update({
    where: { id: collaborator.id },
    data: { status: 'REMOVED' },
  })

  return NextResponse.json({ ok: true })
}
