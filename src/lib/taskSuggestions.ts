import { prisma } from './prisma'

/**
 * Datalist suggestions for the free-text fields on the task form, drawn from
 * what this vehicle's log already contains.
 *
 * Better than a fixed list: people reuse the same two or three workshops and
 * a handful of part brands per project, and spelling them differently each
 * time ("Bilstein" / "bilstein" / "Blistein") is what quietly breaks the
 * analytics grouping later.
 *
 * Scoped to one vehicle, so this never surfaces another user's data — the
 * caller has already passed `requireVehicleAccess()` for that vehicle, and
 * nothing here widens it. Costs are not touched, so
 * `hideCostsFromCollaborators` has nothing to say about it.
 */

export interface TaskFieldSuggestions {
  brands: string[]
  workshops: string[]
}

/** Enough to be useful in a dropdown; not so many that it becomes a scroll. */
const LIMIT = 25

export async function taskFieldSuggestions(vehicleId: string): Promise<TaskFieldSuggestions> {
  const [brands, workshops] = await Promise.all([
    prisma.task.findMany({
      where: { vehicleId, brand: { not: null } },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { updatedAt: 'desc' },
      take: LIMIT,
    }),
    prisma.task.findMany({
      where: { vehicleId, workshopName: { not: null } },
      select: { workshopName: true },
      distinct: ['workshopName'],
      orderBy: { updatedAt: 'desc' },
      take: LIMIT,
    }),
  ])

  return {
    brands: clean(brands.map((t) => t.brand)),
    workshops: clean(workshops.map((t) => t.workshopName)),
  }
}

/**
 * `distinct` is case-sensitive in Postgres, so "Bilstein" and "bilstein"
 * both survive the query; collapse them here, keeping the first spelling
 * seen (the query is newest-first, so that's the most recent one).
 */
function clean(values: (string | null)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value?.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}
