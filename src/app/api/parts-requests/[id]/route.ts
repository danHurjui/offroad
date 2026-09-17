import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'

// RL-024: owner marks their own request "Found" — the only mutation this
// route supports (no general edit). A found request just stops showing
// in the active "Parts wanted" list; it isn't deleted.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const partsRequest = await prisma.partsRequest.findUnique({ where: { id: params.id } })
  if (!partsRequest) return await apiError('notFound', 404)
  if (partsRequest.userId !== session.user.id) {
    return await apiError('onlyRequester', 403)
  }

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    if (body.status !== 'FOUND') {
      return await apiError('statusMustBeFound', 400)
    }

    const updated = await prisma.partsRequest.update({ where: { id: partsRequest.id }, data: { status: 'FOUND' } })
    return NextResponse.json(updated)
  } catch {
    return await apiError('internalError', 500)
  }
}
