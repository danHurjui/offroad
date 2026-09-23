import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { parseOrganization } from '@/lib/organizations'

/** RL-038: the organisations the caller belongs to, with their role in each. */
export async function GET() {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: session.user.id },
    include: { organization: { include: { _count: { select: { members: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(
    memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      role: m.role,
      members: m.organization._count.members,
    }))
  )
}

/**
 * Creates an organisation with the caller as its first OWNER. Closed beta:
 * an admin switches it on per account (`orgBetaAt`), read from the database
 * so the switch works at once rather than on the next token refresh.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { orgBetaAt: true } })
  if (!user?.orgBetaAt) return await apiError('orgBetaRequired', 403)

  const limit = await consumeRateLimit('orgCreate', `user:${session.user.id}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const result = parseOrganization(parsed.body, { create: true })
  if (!result.ok) return await apiErrorWith('orgFieldInvalid', { field: result.field }, 400)
  const { name, cui, billingAddress } = result.data

  try {
    const organization = await prisma.organization.create({
      data: {
        name: name!,
        cui: cui ?? null,
        billingAddress: billingAddress ?? null,
        members: { create: { userId: session.user.id, role: 'OWNER' } },
      },
    })
    return NextResponse.json({ ...organization, role: 'OWNER' }, { status: 201 })
  } catch {
    return await apiError('internalError', 500)
  }
}
