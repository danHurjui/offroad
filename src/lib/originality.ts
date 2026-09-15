/**
 * RL-019: originality score, restoration mode only.
 * (OEM original completed tasks / all completed tasks) × 100.
 *
 * `null` means "not rated" — either there's no completed work yet, or
 * none of the completed tasks have a part condition set. A task with no
 * condition set still counts in the denominator once *any* task is rated
 * (an unrated part just isn't counted as OEM), matching the ticket's
 * literal formula rather than only averaging over rated tasks.
 */
export interface OriginalityTaskLike {
  status: string
  originalityCondition: string | null
}

export function computeOriginalityScore(tasks: OriginalityTaskLike[], completeStatus: string): number | null {
  const completed = tasks.filter((t) => t.status === completeStatus)
  if (completed.length === 0) return null
  if (!completed.some((t) => t.originalityCondition != null)) return null

  const oemCount = completed.filter((t) => t.originalityCondition === 'OEM_ORIGINAL').length
  return Math.round((oemCount / completed.length) * 100)
}
