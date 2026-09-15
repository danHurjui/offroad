import { computeVehicleProgress } from '@/lib/vehicleProgress'

const COMPLETE = 'DONE'

describe('computeVehicleProgress', () => {
  it('returns 0% and not complete for zero total categories', () => {
    expect(computeVehicleProgress([], 0, COMPLETE)).toEqual({ progressPct: 0, isComplete: false })
  })

  it('returns 0% when no task is completed', () => {
    const tasks = [{ status: 'PLANNED', category: 'ENGINE' }]
    expect(computeVehicleProgress(tasks, 4, COMPLETE)).toEqual({ progressPct: 0, isComplete: false })
  })

  it('computes the percentage of categories with at least one completed task', () => {
    const tasks = [
      { status: COMPLETE, category: 'ENGINE' },
      { status: COMPLETE, category: 'SUSPENSION' },
      { status: 'PLANNED', category: 'TYRES' },
    ]
    expect(computeVehicleProgress(tasks, 4, COMPLETE)).toEqual({ progressPct: 50, isComplete: false })
  })

  it('marks 100% progress as complete', () => {
    const tasks = [
      { status: COMPLETE, category: 'ENGINE' },
      { status: COMPLETE, category: 'SUSPENSION' },
    ]
    expect(computeVehicleProgress(tasks, 2, COMPLETE)).toEqual({ progressPct: 100, isComplete: true })
  })

  it('does not double-count multiple completed tasks in the same category', () => {
    const tasks = [
      { status: COMPLETE, category: 'ENGINE' },
      { status: COMPLETE, category: 'ENGINE' },
    ]
    expect(computeVehicleProgress(tasks, 4, COMPLETE)).toEqual({ progressPct: 25, isComplete: false })
  })
})
