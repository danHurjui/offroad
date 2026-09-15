/**
 * RL-022: shared "is this public vehicle in progress or complete"
 * computation for the community feed's status filter/badge — same
 * category-completion logic used inline on the vehicle dashboard
 * (src/app/dashboard/vehicles/[id]/page.tsx), factored out here since the
 * feed needs it per-card across a list rather than for a single vehicle.
 */
export interface ProgressTaskLike {
  status: string
  category: string
}

export function computeVehicleProgress(
  tasks: ProgressTaskLike[],
  totalCategories: number,
  completeStatus: string
): { progressPct: number; isComplete: boolean } {
  if (totalCategories === 0) return { progressPct: 0, isComplete: false }
  const categoriesWithCompletion = new Set(tasks.filter((t) => t.status === completeStatus).map((t) => t.category))
  const progressPct = Math.round((categoriesWithCompletion.size / totalCategories) * 100)
  return { progressPct, isComplete: progressPct === 100 }
}
