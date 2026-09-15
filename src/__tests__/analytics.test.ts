import {
  taskTotalCost,
  isDateRange,
  rangeCutoff,
  spendByCategory,
  cumulativeSpendByMonth,
  summarizeCosts,
} from '@/lib/analytics'

function task(overrides: Partial<Parameters<typeof taskTotalCost>[0]> & { name?: string } = {}) {
  return {
    category: 'SUSPENSION',
    date: new Date('2025-01-15'),
    workType: 'DIY' as const,
    costRon: 100,
    partsCostRon: null,
    labourCostRon: null,
    name: 'Task',
    ...overrides,
  }
}

describe('taskTotalCost', () => {
  it('uses costRon for a DIY task', () => {
    expect(taskTotalCost(task({ costRon: 500 }))).toBe(500)
  })
  it('sums parts+labour for a workshop task, ignoring costRon', () => {
    expect(taskTotalCost(task({ workType: 'WORKSHOP', costRon: 999, partsCostRon: 100, labourCostRon: 200 }))).toBe(300)
  })
  it('treats missing costs as 0', () => {
    expect(taskTotalCost(task({ costRon: null }))).toBe(0)
  })
})

describe('isDateRange', () => {
  it('accepts the three valid ranges', () => {
    expect(isDateRange('3m')).toBe(true)
    expect(isDateRange('12m')).toBe(true)
    expect(isDateRange('all')).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isDateRange('6m')).toBe(false)
    expect(isDateRange(undefined)).toBe(false)
  })
})

describe('rangeCutoff', () => {
  const now = new Date('2026-06-15')
  it('returns null for "all" (no cutoff)', () => {
    expect(rangeCutoff('all', now)).toBeNull()
  })
  it('returns 3 months back for "3m"', () => {
    expect(rangeCutoff('3m', now)).toEqual(new Date('2026-03-15'))
  })
  it('returns 12 months back for "12m"', () => {
    expect(rangeCutoff('12m', now)).toEqual(new Date('2025-06-15'))
  })
})

describe('spendByCategory', () => {
  it('sums per category and sorts descending', () => {
    const result = spendByCategory([
      task({ category: 'SUSPENSION', costRon: 100 }),
      task({ category: 'ENGINE', costRon: 500 }),
      task({ category: 'SUSPENSION', costRon: 50 }),
    ])
    expect(result).toEqual([
      { category: 'ENGINE', total: 500 },
      { category: 'SUSPENSION', total: 150 },
    ])
  })
  it('returns an empty array for no tasks', () => {
    expect(spendByCategory([])).toEqual([])
  })
})

describe('cumulativeSpendByMonth', () => {
  it('buckets by month and accumulates in chronological order', () => {
    const result = cumulativeSpendByMonth([
      task({ date: new Date('2025-02-01'), costRon: 100 }),
      task({ date: new Date('2025-01-01'), costRon: 200 }),
      task({ date: new Date('2025-01-20'), costRon: 50 }),
    ])
    expect(result).toEqual([
      { month: '2025-01', monthlySpend: 250, cumulative: 250 },
      { month: '2025-02', monthlySpend: 100, cumulative: 350 },
    ])
  })
})

describe('summarizeCosts', () => {
  it('computes total, average per distinct month, and the most expensive task', () => {
    const result = summarizeCosts([
      task({ name: 'Cheap', date: new Date('2025-01-05'), costRon: 50 }),
      task({ name: 'Pricey', date: new Date('2025-01-20'), costRon: 500 }),
      task({ name: 'Other month', date: new Date('2025-02-01'), costRon: 100 }),
    ])
    expect(result.totalSpent).toBe(650)
    expect(result.avgPerMonth).toBe(325) // 650 / 2 distinct months
    expect(result.mostExpensiveTask).toEqual({ name: 'Pricey', cost: 500 })
  })

  it('handles an empty task list without dividing by zero', () => {
    const result = summarizeCosts([])
    expect(result).toEqual({ totalSpent: 0, avgPerMonth: 0, mostExpensiveTask: null })
  })
})
