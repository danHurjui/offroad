/**
 * RL-015: cost analytics dashboard. Pure aggregation functions, kept
 * separate from the page/route so they're unit-testable without mocking
 * Prisma — same pattern as src/lib/documents.ts's decideReminder().
 */

export interface CostTaskLike {
  category: string
  date: Date
  workType: 'DIY' | 'WORKSHOP'
  costRon: number | null
  partsCostRon: number | null
  labourCostRon: number | null
}

export function taskTotalCost(task: CostTaskLike): number {
  return task.workType === 'WORKSHOP' ? (task.partsCostRon ?? 0) + (task.labourCostRon ?? 0) : task.costRon ?? 0
}

export type DateRange = '3m' | '12m' | 'all'

export function isDateRange(value: unknown): value is DateRange {
  return value === '3m' || value === '12m' || value === 'all'
}

/** Null means no cutoff — include everything. */
export function rangeCutoff(range: DateRange, now: Date = new Date()): Date | null {
  if (range === 'all') return null
  const months = range === '3m' ? 3 : 12
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - months)
  return cutoff
}

export interface CategorySpend {
  category: string
  total: number
}

/** Descending by total, so the biggest category leads the bar chart. */
export function spendByCategory(tasks: CostTaskLike[]): CategorySpend[] {
  const totals = new Map<string, number>()
  for (const task of tasks) totals.set(task.category, (totals.get(task.category) ?? 0) + taskTotalCost(task))
  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
}

export interface MonthlyCumulative {
  /** "YYYY-MM", sorts correctly as a plain string. */
  month: string
  monthlySpend: number
  cumulative: number
}

export function cumulativeSpendByMonth(tasks: CostTaskLike[]): MonthlyCumulative[] {
  const byMonth = new Map<string, number>()
  for (const task of tasks) {
    const key = `${task.date.getFullYear()}-${String(task.date.getMonth() + 1).padStart(2, '0')}`
    byMonth.set(key, (byMonth.get(key) ?? 0) + taskTotalCost(task))
  }
  let running = 0
  return Array.from(byMonth.keys())
    .sort()
    .map((month) => {
      const monthlySpend = byMonth.get(month)!
      running += monthlySpend
      return { month, monthlySpend, cumulative: running }
    })
}

export interface CostSummary {
  totalSpent: number
  avgPerMonth: number
  mostExpensiveTask: { name: string; cost: number } | null
}

export function summarizeCosts(tasks: Array<CostTaskLike & { name: string }>): CostSummary {
  let totalSpent = 0
  let mostExpensiveTask: { name: string; cost: number } | null = null
  const monthsSeen = new Set<string>()

  for (const task of tasks) {
    const cost = taskTotalCost(task)
    totalSpent += cost
    monthsSeen.add(`${task.date.getFullYear()}-${task.date.getMonth()}`)
    if (!mostExpensiveTask || cost > mostExpensiveTask.cost) mostExpensiveTask = { name: task.name, cost }
  }

  return {
    totalSpent,
    avgPerMonth: monthsSeen.size > 0 ? totalSpent / monthsSeen.size : 0,
    mostExpensiveTask,
  }
}
