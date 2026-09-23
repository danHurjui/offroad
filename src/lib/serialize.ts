import type { Decimal } from '@prisma/client/runtime/library'

/**
 * Prisma Decimal fields serialize to strings via NextResponse.json
 * (decimal.js defines toJSON as toString()), not numbers. Route handlers
 * should convert cost fields with this before responding so API
 * consumers always get numbers.
 */
export function toNumberOrNull(value: Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return typeof value === 'number' ? value : value.toNumber()
}

interface TaskLike {
  costRon: Decimal | number | null
  partsCostRon: Decimal | number | null
  labourCostRon: Decimal | number | null
  [key: string]: unknown
}

export function serializeTask<T extends TaskLike>(task: T) {
  const partsCostRon = toNumberOrNull(task.partsCostRon)
  const labourCostRon = toNumberOrNull(task.labourCostRon)
  const costRon = toNumberOrNull(task.costRon)
  const totalCostRon =
    task.workType === 'WORKSHOP' ? (partsCostRon ?? 0) + (labourCostRon ?? 0) : costRon ?? 0

  return {
    ...task,
    costRon,
    partsCostRon,
    labourCostRon,
    totalCostRon,
  }
}

/**
 * RL-031: `Vehicle.hideCostsFromCollaborators` is a privacy control, so it
 * has to be enforced where the data leaves the server — not only in the
 * pages that happen to render it. A collaborator calling the JSON API
 * directly must get the same redacted view the dashboard shows them.
 * Owners are never redacted.
 */
export function stripCosts<T extends ReturnType<typeof serializeTask>>(task: T) {
  return { ...task, costRon: null, partsCostRon: null, labourCostRon: null, totalCostRon: null }
}

/** serializeTask + cost redaction for non-owners when the owner hid costs. */
export function serializeTaskFor<T extends TaskLike>(
  task: T,
  { hideCosts }: { hideCosts: boolean },
) {
  const serialized = serializeTask(task)
  return hideCosts ? stripCosts(serialized) : serialized
}

interface WishlistItemLike {
  estimatedCostRon: Decimal | number | null
  targetPriceRon?: Decimal | number | null
  [key: string]: unknown
}

export function serializeWishlistItem<T extends WishlistItemLike>(item: T) {
  return {
    ...item,
    estimatedCostRon: toNumberOrNull(item.estimatedCostRon),
    targetPriceRon: toNumberOrNull(item.targetPriceRon ?? null),
  }
}

interface TrailRunLike {
  distanceKm: Decimal | number | null
  [key: string]: unknown
}

export function serializeTrailRun<T extends TrailRunLike>(run: T) {
  return { ...run, distanceKm: toNumberOrNull(run.distanceKm) }
}

interface WishlistPriceEntryLike {
  priceRon: Decimal | number
  [key: string]: unknown
}

export function serializeWishlistPriceEntry<T extends WishlistPriceEntryLike>(entry: T) {
  return { ...entry, priceRon: toNumberOrNull(entry.priceRon) as number }
}

/**
 * RL-044: a fill-up as the client sees it — Decimals as numbers (pitfall
 * #5), the km lifted off its odometer reading, and the price per litre
 * derived rather than stored.
 */
export function serializeFuelEntry<
  T extends { litres: Decimal | number; totalRon: Decimal | number; odometerReading?: { km: number } | null },
>(entry: T) {
  const { odometerReading, ...rest } = entry
  const litres = toNumberOrNull(entry.litres) ?? 0
  const totalRon = toNumberOrNull(entry.totalRon) ?? 0
  return {
    ...rest,
    litres,
    totalRon,
    km: odometerReading?.km ?? null,
    pricePerLitre: litres > 0 ? Math.round((totalRon / litres) * 1000) / 1000 : null,
  }
}
