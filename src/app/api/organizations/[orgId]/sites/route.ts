import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { accessForRole } from '@/lib/access'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { normalizeSiteName, ORG_SITE_LIMIT, SITE_NAME_MAX } from '@/lib/sites'
import { loadMembership } from '../../load'

type Params = { params: { orgId: string } }

/**
 * #103: an organisation's sites, for the people who run its fleet — OWNERs
 * and FLEET_MANAGERs. Anyone else in it gets the 404 the fleet pages give.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await loadMembership(params.orgId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  if (accessForRole(loaded.role) !== 'owner') return await apiError('notFound', 404)

  const sites = await prisma.organizationSite.findMany({
    where: { organizationId: params.orgId },
    select: { id: true, name: true, _count: { select: { vehicles: true } } },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(sites.map((s) => ({ id: s.id, name: s.name, vehicles: s._count.vehicles })))
}

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const userId = auth.session.user.id
  const loaded = await loadMembership(params.orgId, userId)
  if (!loaded.ok) return loaded.error
  if (accessForRole(loaded.role) !== 'owner') return await apiError('notFound', 404)

  const limit = await consumeRateLimit('orgSite', `user:${userId}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const name = normalizeSiteName(parsed.body.name)
  if (!name) return await apiErrorWith('siteNameInvalid', { max: SITE_NAME_MAX }, 400)

  try {
    const count = await prisma.organizationSite.count({ where: { organizationId: params.orgId } })
    if (count >= ORG_SITE_LIMIT) return await apiErrorWith('siteLimit', { max: ORG_SITE_LIMIT }, 409)
    const site = await prisma.organizationSite.create({
      data: { organizationId: params.orgId, name },
      select: { id: true, name: true },
    })
    return NextResponse.json({ ...site, vehicles: 0 }, { status: 201 })
  } catch (e) {
    // The name is unique per organisation in the database, so two people
    // adding "Cluj" at once get one site and one clear refusal.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return await apiError('siteNameTaken', 409)
    return await apiError('internalError', 500)
  }
}
