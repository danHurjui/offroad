/**
 * The single config flag that drives category/status-tag/photo-type
 * vocabulary per project mode (RigLog_Analysis_Specs_v4.docx §3.1/5.3).
 * Never hardcode a category or status string elsewhere — import and
 * validate against this.
 */

export type ProjectType = 'OFFROAD' | 'RESTORATION' | 'DAILY_DRIVER'

export type Option = { value: string; label: string }

/**
 * Which badge palette a status wears, named by meaning rather than hue —
 * the same vocabulary globals.css uses, so light and dark both come for
 * free (see the Theme section of CLAUDE.md).
 *
 * Statuses used to render as one flat grey, which made a finished job and
 * one still on the ramp look identical down a list. The tone is declared
 * here beside the status rather than in a component, for the same reason
 * the labels are: a mode's vocabulary is this file's business, and being
 * required means a new status has to answer the question.
 */
export type StatusTone = 'neutral' | 'info' | 'accent' | 'warn' | 'danger' | 'success'

export type StatusOption = Option & { tone: StatusTone }

interface ProjectTypeConfig {
  label: string
  screenTitle: string
  progressLabel: string
  addTaskCta: string
  /**
   * Placeholder on the task form's name field. A worked example of what a
   * "task" means in this mode does more than any amount of help text — the
   * word itself means something different in each one.
   */
  namePlaceholder: string
  /**
   * One sentence on what the mode is for, shown wherever somebody chooses
   * one — the create form and the empty garage. That choice is permanent
   * (pitfall #2 in CLAUDE.md), so it is the one place in the app where a
   * sentence of explanation earns its space.
   */
  description: string
  wishlistLabel: string
  communityTabLabel: string
  statusTags: StatusOption[]
  /**
   * The status value that counts as "done" for progress % and for
   * wishlist "mark as installed/fitted" conversion. NOT necessarily
   * `statusTags[statusTags.length - 1]` — off-road's list order follows
   * the product doc ("Done · Planned · Broken · In Progress · Sourced"),
   * which puts DONE first, not last.
   */
  completeStatus: string
  /**
   * Whether the mode has an end state worth showing as a completion %.
   * A build gets finished and a restoration gets completed, so "60% of
   * categories done" reads as real progress. A daily driver's repair log
   * never finishes — it just accumulates — so it shows a running job
   * count instead of a progress bar, and never claims to be "complete".
   */
  tracksCompletion: boolean
  /**
   * RL-046: the category a routine service is logged under, which Car
   * Health measures the service interval from. Null where "a service" is
   * not a thing the mode does — a restoration is rebuilt, not serviced.
   */
  serviceCategory: string | null
  /**
   * RL-040: what a defect reported from the road is logged as — an ordinary
   * job with this category, status and photo type. The status must be one
   * whose tone is warn or danger, so the job reads as needing attention on
   * the manager's garage (a test holds that). Null where the mode has no
   * such status: a restoration is not driven, and has nothing to report.
   */
  defect: { category: string; status: string; photoType: string } | null
  categories: Option[]
  photoTypes: Option[]
  wishlistStatuses: Option[]
}

export const PROJECT_TYPE_CONFIG: Record<ProjectType, ProjectTypeConfig> = {
  OFFROAD: {
    label: 'Off-road build',
    screenTitle: 'My Build',
    progressLabel: 'Build progress',
    addTaskCta: '+ Add modification',
    namePlaceholder: 'e.g. 2" lift kit + shocks',
    description: 'For a rig you are modifying: every part you fit, what it cost, and how far the build has come.',
    wishlistLabel: 'Wishlist',
    communityTabLabel: 'Builds',
    statusTags: [
      { value: 'DONE', label: 'Done', tone: 'success' },
      { value: 'PLANNED', label: 'Planned', tone: 'neutral' },
      // Broken is the one status that wants the eye: it is the only one
      // that means something is wrong rather than unfinished.
      { value: 'BROKEN', label: 'Broken', tone: 'danger' },
      { value: 'IN_PROGRESS', label: 'In Progress', tone: 'info' },
      // The part is in hand but not on the vehicle — further along than
      // planned, not yet done.
      { value: 'SOURCED', label: 'Sourced', tone: 'accent' },
    ],
    completeStatus: 'DONE',
    tracksCompletion: true,
    serviceCategory: 'MAINTENANCE',
    defect: { category: 'MAINTENANCE', status: 'BROKEN', photoType: 'DAMAGE' },
    categories: [
      { value: 'SUSPENSION', label: 'Suspension' },
      { value: 'PROTECTION', label: 'Protection' },
      { value: 'RECOVERY', label: 'Recovery' },
      { value: 'LIGHTING', label: 'Lighting' },
      { value: 'TYRES', label: 'Tyres & Wheels' },
      { value: 'ELECTRONICS', label: 'Electronics' },
      { value: 'ENGINE', label: 'Engine / Drivetrain' },
      { value: 'AESTHETICS', label: 'Aesthetics' },
      { value: 'MAINTENANCE', label: 'Maintenance' },
    ],
    photoTypes: [
      { value: 'BEFORE', label: 'Before' },
      { value: 'AFTER', label: 'After' },
      { value: 'INSTALL', label: 'Install' },
      { value: 'DAMAGE', label: 'Damage' },
      { value: 'TRAIL', label: 'Trail' },
    ],
    wishlistStatuses: [
      { value: 'RESEARCHING', label: 'Researching' },
      { value: 'SOURCED', label: 'Sourced' },
      { value: 'ORDERED', label: 'Ordered' },
      { value: 'INSTALLED', label: 'Installed' },
    ],
  },
  RESTORATION: {
    label: 'Restoration project',
    screenTitle: 'My Restoration',
    progressLabel: 'Restoration progress',
    addTaskCta: '+ Add task / stage',
    namePlaceholder: 'e.g. Strip and re-chrome front bumper',
    description: 'For a classic you are bringing back: the state you found it in, each stage of the work, and how original it still is.',
    wishlistLabel: 'Parts hunt',
    communityTabLabel: 'Restorations',
    // Six ordered stages against four usable tones, so colour groups them
    // coarsely — not started, underway, nearly there, done — rather than
    // giving each stage a hue of its own. The label still says which stage
    // it is; the colour is for reading a long list at a glance.
    statusTags: [
      { value: 'STRIPPED', label: 'Stripped', tone: 'neutral' },
      { value: 'IN_PROGRESS', label: 'In Progress', tone: 'info' },
      { value: 'PRIMED', label: 'Primed', tone: 'info' },
      { value: 'PAINTED', label: 'Painted', tone: 'accent' },
      { value: 'REBUILT', label: 'Rebuilt', tone: 'accent' },
      { value: 'COMPLETE', label: 'Complete', tone: 'success' },
    ],
    completeStatus: 'COMPLETE',
    tracksCompletion: true,
    serviceCategory: null,
    defect: null,
    categories: [
      { value: 'BODY_PANELS', label: 'Body & Panels' },
      { value: 'PAINT', label: 'Paint' },
      { value: 'INTERIOR', label: 'Interior' },
      { value: 'CHROME_TRIM', label: 'Chrome & Trim' },
      { value: 'ENGINE_REBUILD', label: 'Engine Rebuild' },
      { value: 'ELECTRICS', label: 'Electrics' },
      { value: 'CHASSIS', label: 'Chassis & Running Gear' },
      { value: 'GLASS', label: 'Glass' },
      { value: 'DOCUMENTATION', label: 'Documentation' },
    ],
    photoTypes: [
      { value: 'FOUND_STATE', label: 'Found state' },
      { value: 'STRIPPED', label: 'Stripped' },
      { value: 'PROGRESS', label: 'Progress' },
      { value: 'DETAIL', label: 'Detail' },
      { value: 'COMPLETE', label: 'Complete' },
    ],
    wishlistStatuses: [
      { value: 'HUNTING', label: 'Hunting' },
      { value: 'LOCATED', label: 'Located' },
      { value: 'RESERVED', label: 'Reserved' },
      { value: 'PURCHASED', label: 'Purchased' },
      { value: 'FITTED', label: 'Fitted' },
    ],
  },
  // A car in daily use. The vocabulary is servicing/repair work rather
  // than build or restoration stages, and the statuses describe what a
  // job needs next ("due", "booked in") instead of how far through a
  // rebuild it is. Deliberately keeps the wishlist — the everyday
  // equivalent is a list of jobs to get around to.
  DAILY_DRIVER: {
    label: 'Daily driver',
    screenTitle: 'My Car',
    progressLabel: 'Jobs logged',
    addTaskCta: '+ Log a repair',
    namePlaceholder: 'e.g. Front brake pads and discs',
    description: 'For the car you drive every day: repairs and servicing, what they cost, and when the ITP and RCA run out.',
    wishlistLabel: 'Planned work',
    communityTabLabel: 'Daily drivers',
    statusTags: [
      { value: 'DONE', label: 'Done', tone: 'success' },
      // Due is a nag, not a failure: something needs booking.
      { value: 'DUE', label: 'Due', tone: 'warn' },
      { value: 'BOOKED', label: 'Booked in', tone: 'accent' },
      { value: 'IN_PROGRESS', label: 'In Progress', tone: 'info' },
      // Knowingly put off, so it should not shout like a due job.
      { value: 'DEFERRED', label: 'Deferred', tone: 'neutral' },
    ],
    completeStatus: 'DONE',
    tracksCompletion: false,
    serviceCategory: 'SERVICING',
    defect: { category: 'OTHER', status: 'DUE', photoType: 'FAULT' },
    categories: [
      { value: 'SERVICING', label: 'Servicing & Fluids' },
      { value: 'BRAKES', label: 'Brakes' },
      { value: 'TYRES', label: 'Tyres & Wheels' },
      { value: 'SUSPENSION', label: 'Suspension & Steering' },
      { value: 'ENGINE', label: 'Engine' },
      { value: 'TRANSMISSION', label: 'Transmission & Clutch' },
      { value: 'ELECTRICAL', label: 'Electrical' },
      // RL-056 (#124): the traction battery, charge port, on-board charger
      // and wallbox. The 12V battery stays under ELECTRICAL.
      { value: 'HV_BATTERY', label: 'High-voltage battery & charging' },
      { value: 'COOLING', label: 'Cooling & Heating' },
      { value: 'EXHAUST', label: 'Exhaust & Emissions' },
      { value: 'BODYWORK', label: 'Bodywork & Glass' },
      { value: 'INSPECTION', label: 'ITP & Inspection' },
      { value: 'OTHER', label: 'Other' },
    ],
    photoTypes: [
      { value: 'FAULT', label: 'Fault' },
      { value: 'REPAIR', label: 'Repair' },
      { value: 'PART', label: 'Part' },
      { value: 'OTHER', label: 'Other' },
    ],
    wishlistStatuses: [
      { value: 'RESEARCHING', label: 'Researching' },
      { value: 'QUOTED', label: 'Quoted' },
      { value: 'ORDERED', label: 'Ordered' },
      { value: 'FITTED', label: 'Fitted' },
    ],
  },
}

export const PART_CONDITIONS: Option[] = [
  { value: 'NOS', label: 'NOS (new old stock)' },
  { value: 'GOOD_USED', label: 'Good used' },
  { value: 'NEEDS_WORK', label: 'Needs work' },
  { value: 'REPRODUCTION', label: 'Reproduction' },
]

export const ORIGINALITY_CONDITIONS: Option[] = [
  { value: 'OEM_ORIGINAL', label: 'OEM original' },
  { value: 'PERIOD_CORRECT', label: 'Period correct' },
  { value: 'MODERN_REPLACEMENT', label: 'Modern replacement' },
  { value: 'REPRODUCTION', label: 'Reproduction' },
]

/** Every mode, in the order they're offered in the UI. */
export const PROJECT_TYPES = Object.keys(PROJECT_TYPE_CONFIG) as ProjectType[]

// Derived from the config rather than a hand-written list of literals, so
// adding a mode above can't leave a validator behind still rejecting it.
export function isProjectType(value: unknown): value is ProjectType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROJECT_TYPE_CONFIG, value)
}

export function isValidCategory(projectType: ProjectType, category: string): boolean {
  return PROJECT_TYPE_CONFIG[projectType].categories.some((c) => c.value === category)
}

export function isValidStatus(projectType: ProjectType, status: string): boolean {
  return PROJECT_TYPE_CONFIG[projectType].statusTags.some((s) => s.value === status)
}

export function isValidPhotoType(projectType: ProjectType, photoType: string): boolean {
  return PROJECT_TYPE_CONFIG[projectType].photoTypes.some((p) => p.value === photoType)
}

export function labelFor(options: Option[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value
}

export function isValidTaskVocabulary(projectType: unknown, category: string, status: string): boolean {
  if (!isProjectType(projectType)) return false
  return isValidCategory(projectType, category) && isValidStatus(projectType, status)
}

/** The globals.css class for a tone. Kept beside the tones themselves so
 *  adding one makes tsc name this map. */
const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  neutral: 'badge-neutral',
  info: 'badge-info',
  accent: 'badge-accent',
  warn: 'badge-warn',
  danger: 'badge-danger',
  success: 'badge-success',
}

/**
 * The badge classes for a task's status.
 *
 * Takes the status options rather than the mode so it works with the
 * translated vocabulary too — those carry the tone through unchanged,
 * since a colour is not something to translate. An unknown status (a row
 * written under a vocabulary that has since changed) falls back to
 * neutral rather than throwing.
 */
export function statusBadgeClass(options: StatusOption[], value: string): string {
  const tone = options.find((o) => o.value === value)?.tone ?? 'neutral'
  return `badge ${STATUS_TONE_CLASS[tone]}`
}
