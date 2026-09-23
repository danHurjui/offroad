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

/**
 * RL-045: the vehicle's own money columns — purchase, the owner's value
 * estimate, finance — as numbers (pitfall #5).
 */
export const VEHICLE_MONEY_FIELDS = ['purchasePriceRon', 'currentValueRon', 'financeMonthlyRon'] as const

export function vehicleMoney(vehicle: Record<(typeof VEHICLE_MONEY_FIELDS)[number], Decimal | number | null>) {
  return {
    purchasePriceRon: toNumberOrNull(vehicle.purchasePriceRon),
    currentValueRon: toNumberOrNull(vehicle.currentValueRon),
    financeMonthlyRon: toNumberOrNull(vehicle.financeMonthlyRon),
  }
}

/**
 * A vehicle row as it leaves the server. Purchase, value and finance are
 * what the vehicle cost the owner, so `hideCostsFromCollaborators` removes
 * them for a collaborator the same way it removes the totals — they are
 * private money figures, not a job's line items.
 */
export function serializeVehicle<T extends Record<(typeof VEHICLE_MONEY_FIELDS)[number], Decimal | number | null>>(
  vehicle: T,
  { hideCosts }: { hideCosts: boolean } = { hideCosts: false }
) {
  if (hideCosts) {
    return {
      ...vehicle,
      purchasePriceRon: null,
      currentValueRon: null,
      currentValueAt: null,
      financeType: null,
      financeMonthlyRon: null,
      financeStartDate: null,
      financeEndDate: null,
    }
  }
  return { ...vehicle, ...vehicleMoney(vehicle) }
}

/** A Document with its RL-045 price as a number (pitfall #5). */
export function serializeDocument<T extends { costRon: Decimal | number | null }>(document: T) {
  return { ...document, costRon: toNumberOrNull(document.costRon) }
}
