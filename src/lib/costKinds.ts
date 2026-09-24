/**
 * RL-045 vocabulary, apart from `ownershipCosts.ts` so client components
 * can import it without pulling the server-side parsing (amounts.ts →
 * apiError → request headers) into the browser bundle.
 */

export const COST_CATEGORIES = [
  'purchase',
  'finance',
  // RL-055: fuel and charging together — what it cost to move the vehicle.
  'energy',
  'work',
  'insurance',
  'inspection',
  'roadCharges',
  'tyres',
  'other',
] as const
export type CostCategory = (typeof COST_CATEGORIES)[number]

export const EXPENSE_KINDS = ['TAX', 'TOLL', 'ROAD_CHARGE', 'INSURANCE', 'INSPECTION', 'PARKING', 'WASH', 'FINE', 'OTHER'] as const
export type ExpenseKind = (typeof EXPENSE_KINDS)[number]

export const FINANCE_TYPES = ['LEASING', 'CREDIT'] as const
export type FinanceType = (typeof FINANCE_TYPES)[number]

export function isExpenseKind(value: unknown): value is ExpenseKind {
  return typeof value === 'string' && (EXPENSE_KINDS as readonly string[]).includes(value)
}

export function isFinanceType(value: unknown): value is FinanceType {
  return typeof value === 'string' && (FINANCE_TYPES as readonly string[]).includes(value)
}
