import { prisma } from './prisma'

/**
 * RL-036: the dashboard's first-vehicle checklist.
 *
 * Four steps, in the order somebody meets them: a vehicle, a job on it, a
 * photo of the job, and a document with an expiry date. The last one is
 * there because reminders are the part of the app that works while nobody
 * is looking at it, and nothing else on a first visit points at it.
 *
 * Every step is read from the account's own rows rather than recorded as
 * it happens. A step ticked by an event would need a write in four
 * different routes, and would go stale the moment one of them forgot.
 *
 * ## When it goes away
 *
 * `User.onboardingClosedAt`, set either by the Hide button or the first
 * time the dashboard sees every step done. Once set it is never cleared:
 * somebody who deletes their only vehicle to start over is not a
 * beginner, and a checklist reappearing then would read as the app
 * forgetting them. It lives on the account, not in localStorage, so it
 * does not follow somebody who has finished onto a second browser.
 *
 * Accounts that already owned a vehicle with a job when this shipped
 * were closed by the migration — a returning user never sees it.
 */

export const ONBOARDING_STEPS = ['vehicle', 'task', 'photo', 'document'] as const
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

export type OnboardingCounts = Record<OnboardingStep, number>

export interface OnboardingState {
  steps: { id: OnboardingStep; done: boolean }[]
  doneCount: number
  complete: boolean
}

/** Pure, so the rules can be tested without a database. */
export function onboardingState(counts: OnboardingCounts): OnboardingState {
  const steps = ONBOARDING_STEPS.map((id) => ({ id, done: counts[id] > 0 }))
  const doneCount = steps.filter((s) => s.done).length
  return { steps, doneCount, complete: doneCount === steps.length }
}

/**
 * Whether the checklist belongs on this dashboard at all.
 *
 * Someone who only collaborates on other people's vehicles — a mechanic
 * invited to a customer's car — has not come here to set up a garage of
 * their own, and "Add a vehicle" at the top of their screen would be the
 * wrong suggestion.
 */
export function shouldShowChecklist({
  closedAt,
  ownedVehicles,
  collaboratingVehicles,
}: {
  closedAt: Date | null
  ownedVehicles: number
  collaboratingVehicles: number
}): boolean {
  if (closedAt) return false
  if (ownedVehicles === 0 && collaboratingVehicles > 0) return false
  return true
}

/**
 * Counts for the owner's own vehicles only — a job logged as a
 * collaborator on somebody else's car is not this account's first job.
 * One cheap `count` per step, run only while the checklist is still open.
 */
export async function loadOnboardingCounts(userId: string, ownedVehicles: number): Promise<OnboardingCounts> {
  const owned = { ownerId: userId, organizationId: null }
  const [task, photo, document] = await Promise.all([
    prisma.task.count({ where: { vehicle: owned } }),
    prisma.taskPhoto.count({ where: { task: { vehicle: owned } } }),
    prisma.document.count({ where: { vehicle: owned } }),
  ])
  return { vehicle: ownedVehicles, task, photo, document }
}

/**
 * Closes the checklist for good. `updateMany` with the null filter keeps
 * the first timestamp — a second Hide from another tab, or a completion
 * seen after a dismissal, does not move it.
 */
export async function closeOnboarding(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, onboardingClosedAt: null },
    data: { onboardingClosedAt: new Date() },
  })
}
