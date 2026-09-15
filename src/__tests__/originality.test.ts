import { computeOriginalityScore } from '@/lib/originality'

const COMPLETE = 'COMPLETE'

describe('computeOriginalityScore', () => {
  it('returns null when there are no completed tasks', () => {
    expect(computeOriginalityScore([{ status: 'IN_PROGRESS', originalityCondition: null }], COMPLETE)).toBeNull()
  })

  it('returns null when no completed task has a part condition set', () => {
    const tasks = [
      { status: COMPLETE, originalityCondition: null },
      { status: COMPLETE, originalityCondition: null },
    ]
    expect(computeOriginalityScore(tasks, COMPLETE)).toBeNull()
  })

  it('computes the percentage of OEM-original completed tasks', () => {
    const tasks = [
      { status: COMPLETE, originalityCondition: 'OEM_ORIGINAL' },
      { status: COMPLETE, originalityCondition: 'OEM_ORIGINAL' },
      { status: COMPLETE, originalityCondition: 'REPRODUCTION' },
      { status: COMPLETE, originalityCondition: 'MODERN_REPLACEMENT' },
    ]
    expect(computeOriginalityScore(tasks, COMPLETE)).toBe(50)
  })

  it('counts a completed task with no condition set as not-OEM once any task is rated', () => {
    const tasks = [
      { status: COMPLETE, originalityCondition: 'OEM_ORIGINAL' },
      { status: COMPLETE, originalityCondition: null },
    ]
    expect(computeOriginalityScore(tasks, COMPLETE)).toBe(50)
  })

  it('ignores tasks that are not completed', () => {
    const tasks = [
      { status: COMPLETE, originalityCondition: 'OEM_ORIGINAL' },
      { status: 'IN_PROGRESS', originalityCondition: 'REPRODUCTION' },
    ]
    expect(computeOriginalityScore(tasks, COMPLETE)).toBe(100)
  })

  it('rounds to the nearest whole percent', () => {
    const tasks = [
      { status: COMPLETE, originalityCondition: 'OEM_ORIGINAL' },
      { status: COMPLETE, originalityCondition: 'REPRODUCTION' },
      { status: COMPLETE, originalityCondition: 'REPRODUCTION' },
    ]
    expect(computeOriginalityScore(tasks, COMPLETE)).toBe(33)
  })
})
