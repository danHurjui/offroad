/**
 * The single config flag that drives category/status-tag/photo-type
 * vocabulary per project mode (RigLog_Analysis_Specs_v4.docx §3.1/5.3).
 * Never hardcode a category or status string elsewhere — import and
 * validate against this.
 */

export type ProjectType = 'OFFROAD' | 'RESTORATION' | 'DAILY_DRIVER'

export type Option = { value: string; label: string }

interface ProjectTypeConfig {
  label: string
  screenTitle: string
  progressLabel: string
  addTaskCta: string
  wishlistLabel: string
  communityTabLabel: string
  statusTags: Option[]
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
    wishlistLabel: 'Wishlist',
    communityTabLabel: 'Builds',
    statusTags: [
      { value: 'DONE', label: 'Done' },
      { value: 'PLANNED', label: 'Planned' },
      { value: 'BROKEN', label: 'Broken' },
      { value: 'IN_PROGRESS', label: 'In Progress' },
      { value: 'SOURCED', label: 'Sourced' },
    ],
    completeStatus: 'DONE',
    tracksCompletion: true,
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
    wishlistLabel: 'Parts hunt',
    communityTabLabel: 'Restorations',
    statusTags: [
      { value: 'STRIPPED', label: 'Stripped' },
      { value: 'IN_PROGRESS', label: 'In Progress' },
      { value: 'PRIMED', label: 'Primed' },
      { value: 'PAINTED', label: 'Painted' },
      { value: 'REBUILT', label: 'Rebuilt' },
      { value: 'COMPLETE', label: 'Complete' },
    ],
    completeStatus: 'COMPLETE',
    tracksCompletion: true,
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
    wishlistLabel: 'Planned work',
    communityTabLabel: 'Daily drivers',
    statusTags: [
      { value: 'DONE', label: 'Done' },
      { value: 'DUE', label: 'Due' },
      { value: 'BOOKED', label: 'Booked in' },
      { value: 'IN_PROGRESS', label: 'In Progress' },
      { value: 'DEFERRED', label: 'Deferred' },
    ],
    completeStatus: 'DONE',
    tracksCompletion: false,
    categories: [
      { value: 'SERVICING', label: 'Servicing & Fluids' },
      { value: 'BRAKES', label: 'Brakes' },
      { value: 'TYRES', label: 'Tyres & Wheels' },
      { value: 'SUSPENSION', label: 'Suspension & Steering' },
      { value: 'ENGINE', label: 'Engine' },
      { value: 'TRANSMISSION', label: 'Transmission & Clutch' },
      { value: 'ELECTRICAL', label: 'Electrical' },
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
