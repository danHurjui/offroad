/**
 * #103: an organisation's sites (depots, branches). Pure and client-safe —
 * the organisation page's form reads the same rules the routes enforce.
 *
 * A site does one thing: it narrows the fleet pages and reports to the
 * vehicles kept there. It grants nothing and hides nothing — access is
 * still the organisation role (`access.ts`), whatever site a vehicle is at.
 */

export const SITE_NAME_MAX = 60
/** Plenty for any real company; a bound so a script cannot fill the table. */
export const ORG_SITE_LIMIT = 100

/** The name as stored — trimmed, single spaces — or false if it cannot be one. */
export function normalizeSiteName(value: unknown): string | false {
  if (typeof value !== 'string') return false
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name || name.length > SITE_NAME_MAX) return false
  return name
}

export interface SiteOption {
  id: string
  name: string
}

/** The site a filter names, if it is one of these; otherwise none — the whole organisation. */
export function pickSite<S extends SiteOption>(sites: S[], id: string | null | undefined): S | null {
  return (id && sites.find((s) => s.id === id)) || null
}

/** The vehicle filter for a chosen site, to spread into a `where`. */
export function siteVehicleWhere(site: SiteOption | null): { siteId?: string } {
  return site ? { siteId: site.id } : {}
}
