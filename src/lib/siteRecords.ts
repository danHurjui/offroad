import { prisma } from '@/lib/prisma'
import type { SiteOption } from '@/lib/sites'

/** Every site of an organisation, by name — for a filter or a picker. */
export function loadSites(organizationId: string): Promise<SiteOption[]> {
  return prisma.organizationSite.findMany({
    where: { organizationId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
}

/**
 * A `site` asked for in a report's query: none (the whole organisation),
 * or one of *this* organisation's sites. Any other id is `false` — the
 * caller answers 404, never another organisation's vehicles.
 */
export async function siteFromQuery(organizationId: string, param: string | null): Promise<SiteOption | null | false> {
  if (!param) return null
  const site = await prisma.organizationSite.findUnique({ where: { id: param }, select: { id: true, name: true, organizationId: true } })
  if (!site || site.organizationId !== organizationId) return false
  return { id: site.id, name: site.name }
}
