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
