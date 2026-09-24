import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { accessForRole } from '@/lib/access'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { normalizeSiteName, SITE_NAME_MAX } from '@/lib/sites'
import { loadMembership } from '../../../load'

type Params = { params: { orgId: string; siteId: string } }

/**
 * The caller runs this organisation's fleet, and the site is one of *its*
 * sites — an id from another organisation is a 404, never somebody else's
 * site renamed or deleted.
 */
async function authorize(orgId: string, siteId: string, userId: string) {
  const loaded = await loadMembership(orgId, userId)
  if (!loaded.ok) return loaded
  if (accessForRole(loaded.role) !== 'owner') return { ok: false as const, error: await apiError('notFound', 404) }
  const limit = await consumeRateLimit('orgSite', `user:${userId}`)
  if (!limit.ok) return { ok: false as const, error: await rateLimitResponse(limit) }
  const site = await prisma.organizationSite.findUnique({ where: { id: siteId }, select: { id: true, organizationId: true } })
  if (!site || site.organizationId !== orgId) return { ok: false as const, error: await apiError('notFound', 404) }
  return { ok: true as const, site }
}

/** Renames a site. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const allowed = await authorize(params.orgId, params.siteId, auth.session.user.id)
  if (!allowed.ok) return allowed.error

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const name = normalizeSiteName(parsed.body.name)
  if (!name) return await apiErrorWith('siteNameInvalid', { max: SITE_NAME_MAX }, 400)

  try {
    const site = await prisma.organizationSite.update({ where: { id: allowed.site.id }, data: { name }, select: { id: true, name: true } })
    return NextResponse.json(site)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return await apiError('siteNameTaken', 409)
    return await apiError('internalError', 500)
  }
}

/**
 * Deletes a site. Its vehicles are unassigned by the foreign key (SET
 * NULL) in the same statement — they stay in the organisation, with every
 * record, and simply belong to no site.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const allowed = await authorize(params.orgId, params.siteId, auth.session.user.id)
  if (!allowed.ok) return allowed.error

  try {
    await prisma.organizationSite.delete({ where: { id: allowed.site.id } })
    return NextResponse.json({ ok: true })
  } catch {
    return await apiError('internalError', 500)
  }
}
