import type { Vehicle } from '@prisma/client'
import { prisma } from './prisma'
import { toNumberOrNull } from './serialize'
import type { OwnershipInput } from './ownershipCosts'

type OwnershipVehicle = Pick<
  Vehicle,
  | 'id'
  | 'projectType'
  | 'createdAt'
  | 'purchaseDate'
  | 'purchasePriceRon'
  | 'currentValueRon'
  | 'currentValueAt'
  | 'financeType'
  | 'financeMonthlyRon'
  | 'financeStartDate'
  | 'financeEndDate'
>

/**
 * The rows `ownershipReport()` needs, for one vehicle or a whole fleet, in
 * six batched queries whatever the count — never a query per vehicle. The
 * vehicle cost page and the fleet cost page (RL-039) both load through
 * here, so they cannot add up different things. Decimals are converted
 * here (pitfall #5); the caller has already checked access.
 */
export async function loadOwnershipInputs(vehicles: OwnershipVehicle[], now: Date): Promise<Map<string, OwnershipInput>> {
  const ids = vehicles.map((v) => v.id)
  const inputs = new Map<string, OwnershipInput>()
  if (ids.length === 0) return inputs
  const where = { vehicleId: { in: ids } }

  const [tasks, fuel, documents, tyreSets, expenses, readings] = await Promise.all([
    prisma.task.findMany({
      where,
      select: { id: true, vehicleId: true, name: true, category: true, date: true, workType: true, costRon: true, partsCostRon: true, labourCostRon: true },
    }),
    prisma.fuelEntry.findMany({ where, select: { id: true, vehicleId: true, date: true, totalRon: true, station: true } }),
    prisma.document.findMany({ where, select: { id: true, vehicleId: true, type: true, costRon: true, paidAt: true, createdAt: true } }),
    prisma.tyreSet.findMany({
      where,
      select: { id: true, vehicleId: true, season: true, label: true, costRon: true, purchasedAt: true, fittedAt: true, createdAt: true },
    }),
    prisma.vehicleExpense.findMany({ where, select: { id: true, vehicleId: true, date: true, kind: true, amountRon: true, note: true } }),
    prisma.odometerReading.findMany({ where, select: { id: true, vehicleId: true, km: true, readAt: true, isOverride: true, createdAt: true } }),
  ])

  for (const v of vehicles) {
    const mine = <T extends { vehicleId: string }>(rows: T[]) => rows.filter((r) => r.vehicleId === v.id)
    inputs.set(v.id, {
      vehicleId: v.id,
      projectType: v.projectType,
      now,
      vehicle: {
        createdAt: v.createdAt,
        purchaseDate: v.purchaseDate,
        purchasePriceRon: toNumberOrNull(v.purchasePriceRon),
        currentValueRon: toNumberOrNull(v.currentValueRon),
        currentValueAt: v.currentValueAt,
        financeType: v.financeType,
        financeMonthlyRon: toNumberOrNull(v.financeMonthlyRon),
        financeStartDate: v.financeStartDate,
        financeEndDate: v.financeEndDate,
      },
      tasks: mine(tasks).map((task) => ({
        ...task,
        costRon: toNumberOrNull(task.costRon),
        partsCostRon: toNumberOrNull(task.partsCostRon),
        labourCostRon: toNumberOrNull(task.labourCostRon),
      })),
      fuel: mine(fuel).map((f) => ({ ...f, totalRon: toNumberOrNull(f.totalRon) ?? 0 })),
      documents: mine(documents).map((d) => ({ ...d, costRon: toNumberOrNull(d.costRon) })),
      tyreSets: mine(tyreSets).map((s) => ({ ...s, costRon: toNumberOrNull(s.costRon) })),
      expenses: mine(expenses).map((e) => ({ ...e, amountRon: toNumberOrNull(e.amountRon) ?? 0 })),
      readings: mine(readings),
    })
  }
  return inputs
}
