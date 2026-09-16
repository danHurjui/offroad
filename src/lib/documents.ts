import type { Option } from '@/lib/projectType'

/** RL-013: document reminders — ITP, RCA, CASCO, Rovinieta, and travel documents. */
export const DOCUMENT_TYPE_OPTIONS: Option[] = [
  { value: 'ITP', label: 'ITP (technical inspection)' },
  { value: 'RCA', label: 'RCA (mandatory liability insurance)' },
  { value: 'CASCO', label: 'CASCO (comprehensive insurance)' },
  { value: 'ROVINIETA', label: 'Rovinietă' },
  { value: 'FIRST_AID_KIT', label: 'First aid kit' },
  { value: 'FIRE_EXTINGUISHER', label: 'Fire extinguisher' },
  { value: 'VIGNETTE', label: 'Vignette (travel abroad)' },
]

export function isValidDocumentType(value: unknown): boolean {
  return DOCUMENT_TYPE_OPTIONS.some((o) => o.value === value)
}

/**
 * Descending, and `decideReminder` relies on that order to pick the most
 * urgent threshold crossed. 7 and 1 were added for issue #21 — an ITP or
 * RCA is worth chasing a week out and again the day before, which is when
 * people actually book one.
 */
const REMINDER_MILESTONES_DAYS = [30, 14, 7, 3, 1] as const
export type ReminderMilestone = (typeof REMINDER_MILESTONES_DAYS)[number]
export { REMINDER_MILESTONES_DAYS }

export type DocumentStatus = 'valid' | 'expiring' | 'expired'

/**
 * Days remaining until expiry (negative once expired) and the
 * valid/expiring/expired bucket used for the colour-coded document list
 * (RL-013: expiring = amber, under 30 days; expired = red).
 */
export function getDocumentStatus(expiryDate: Date, now: Date = new Date()): { daysUntil: number; status: DocumentStatus } {
  const msPerDay = 24 * 60 * 60 * 1000
  const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / msPerDay)
  const status: DocumentStatus = daysUntil < 0 ? 'expired' : daysUntil <= 30 ? 'expiring' : 'valid'
  return { daysUntil, status }
}

interface ReminderState {
  reminder30SentAt: Date | null
  reminder14SentAt: Date | null
  reminder7SentAt: Date | null
  reminder3SentAt: Date | null
  reminder1SentAt: Date | null
}

type ReminderField =
  | 'reminder30SentAt'
  | 'reminder14SentAt'
  | 'reminder7SentAt'
  | 'reminder3SentAt'
  | 'reminder1SentAt'

/**
 * Typed `Record<ReminderMilestone, …>`, so adding a day to
 * REMINDER_MILESTONES_DAYS without adding its column makes tsc name this
 * object rather than failing at runtime on an undefined field.
 */
const MILESTONE_FIELDS: Record<ReminderMilestone, ReminderField> = {
  30: 'reminder30SentAt',
  14: 'reminder14SentAt',
  7: 'reminder7SentAt',
  3: 'reminder3SentAt',
  1: 'reminder1SentAt',
}

/**
 * Every `reminderNSentAt` column, derived from the milestone list.
 *
 * The cron's "any threshold still unsent" filter and the PATCH that
 * re-arms reminders on renewal both build from this, so adding a
 * milestone is one edit rather than three — and cannot half-land, which
 * would leave a new threshold that never fires or never resets.
 */
export const REMINDER_FIELDS: readonly ReminderField[] = REMINDER_MILESTONES_DAYS.map(
  (m) => MILESTONE_FIELDS[m]
)

/** `{ reminder30SentAt: null, … }` — re-arms every reminder on renewal. */
export function clearedReminderFields(): Record<ReminderField, null> {
  return Object.fromEntries(REMINDER_FIELDS.map((f) => [f, null])) as Record<ReminderField, null>
}

export interface ReminderDecision {
  shouldSend: boolean
  /** The most urgent milestone crossed this run — used to word the email, not to gate sending. */
  milestoneDays: number | null
  fieldsToMarkSent: ReminderField[]
}

/**
 * Decides whether a document's cron check should fire a reminder email.
 * Pure and DB-free so it's unit-testable without mocking Prisma.
 *
 * A document that's crossed multiple unsent thresholds at once (e.g. it
 * was created 10 days before expiry, so 30- and 14-day are both "reached"
 * on the very first cron run) gets exactly one catch-up email, not one
 * per threshold — but every reached threshold gets marked sent so none
 * of them fire again later as a stale duplicate.
 */
export function decideReminder(daysUntil: number, state: ReminderState): ReminderDecision {
  const reached = REMINDER_MILESTONES_DAYS.filter(
    (m) => daysUntil <= m && state[MILESTONE_FIELDS[m]] === null
  )
  if (reached.length === 0) return { shouldSend: false, milestoneDays: null, fieldsToMarkSent: [] }
  return {
    shouldSend: true,
    milestoneDays: reached[reached.length - 1],
    fieldsToMarkSent: reached.map((m) => MILESTONE_FIELDS[m]),
  }
}

export function formatDaysUntil(daysUntil: number): string {
  if (daysUntil < 0) return `expired ${Math.abs(daysUntil)} day${Math.abs(daysUntil) === 1 ? '' : 's'} ago`
  if (daysUntil === 0) return 'expires today'
  return `expires in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`
}

const HISTORIC_VEHICLE_AGE_YEARS = 30

/**
 * Vehicles registered in Romania that are 30+ years old qualify for
 * historic status: ITP every 2 years instead of annually (RL-013 note,
 * Analysis Specs §12). Purely informational here — surfaced as a banner,
 * it does not change reminder math (that's still relative to whatever
 * expiryDate the user entered).
 */
export function isHistoricVehicle(year: number, now: Date = new Date()): boolean {
  return now.getFullYear() - year >= HISTORIC_VEHICLE_AGE_YEARS
}
