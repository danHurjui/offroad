/**
 * The single config flag that drives category/status-tag/photo-type
 * vocabulary per project mode (RigLog_Analysis_Specs_v4.docx §3.1/5.3).
 * Never hardcode a category or status string elsewhere — import and
 * validate against this.
 */

export type ProjectType = 'OFFROAD' | 'RESTORATION'

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

export function isProjectType(value: unknown): value is ProjectType {
  return value === 'OFFROAD' || value === 'RESTORATION'
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
