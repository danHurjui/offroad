import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import {
  ORIGINALITY_CONDITIONS,
  PART_CONDITIONS,
  PROJECT_TYPE_CONFIG,
  type Option,
  type ProjectType,
} from './projectType'

/**
 * The project-type vocabulary, in the reader's language.
 *
 * ## What this does and does not move
 *
 * `PROJECT_TYPE_CONFIG` stays the single source of truth for the
 * *vocabulary itself* — which categories a mode has, which status counts
 * as done, what order they appear in — and every validator
 * (`isValidCategory`, `isValidStatus`, `isValidPhotoType`) keeps reading
 * it directly. Only the human-readable label is looked up per request.
 *
 * That split is load-bearing. `Task.category` stores `SUSPENSION`, not
 * "Suspensie", and a validator that consulted a translated list would
 * start accepting or rejecting rows depending on which language the
 * request happened to be in. The values are the contract; the labels are
 * presentation. Pitfall #2 in CLAUDE.md is the same idea from the other
 * direction: the stored string is fixed at write time and never migrates.
 *
 * ## Why it returns the same shape
 *
 * Callers do `config.categories.map(...)`, `config.addTaskCta`,
 * `labelFor(config.statusTags, task.status)`. Handing back an identically
 * shaped object means those lines do not change — only the line that
 * obtains the config does. A per-label lookup at 87 call sites would have
 * been the alternative, and every one of them a chance to miss one.
 *
 * A missing key surfaces as the key itself rather than a crash, which is
 * next-intl's behaviour and the right one here: an untranslated category
 * should look wrong in review, not take the dashboard down. The catalogue
 * is generated from this config and `projectType.test.ts` asserts both
 * languages cover every value, so it should not happen.
 */

export interface VocabularyConfig {
  label: string
  screenTitle: string
  progressLabel: string
  addTaskCta: string
  namePlaceholder: string
  wishlistLabel: string
  communityTabLabel: string
  statusTags: Option[]
  completeStatus: string
  tracksCompletion: boolean
  categories: Option[]
  photoTypes: Option[]
  wishlistStatuses: Option[]
}

/** Just enough of next-intl's translator for this module to be testable. */
type Translator = (key: string) => string

function relabel(options: Option[], t: Translator, prefix: string): Option[] {
  return options.map((option) => ({ value: option.value, label: t(`${prefix}.${option.value}`) }))
}

/**
 * Pure, so the mapping can be unit-tested with a stub translator instead
 * of a React tree or a request context.
 */
export function translateConfig(projectType: ProjectType, t: Translator): VocabularyConfig {
  const base = PROJECT_TYPE_CONFIG[projectType]

  return {
    // Structure and behaviour come from the config, untranslated.
    completeStatus: base.completeStatus,
    tracksCompletion: base.tracksCompletion,

    label: t(`mode.${projectType}.label`),
    screenTitle: t(`mode.${projectType}.screenTitle`),
    progressLabel: t(`mode.${projectType}.progressLabel`),
    addTaskCta: t(`mode.${projectType}.addTaskCta`),
    namePlaceholder: t(`mode.${projectType}.namePlaceholder`),
    wishlistLabel: t(`mode.${projectType}.wishlistLabel`),
    communityTabLabel: t(`mode.${projectType}.communityTabLabel`),

    statusTags: relabel(base.statusTags, t, `status.${projectType}`),
    categories: relabel(base.categories, t, `category.${projectType}`),
    photoTypes: relabel(base.photoTypes, t, `photoType.${projectType}`),
    wishlistStatuses: relabel(base.wishlistStatuses, t, `wishlistStatus.${projectType}`),
  }
}

export function translatePartConditions(t: Translator): Option[] {
  return relabel(PART_CONDITIONS, t, 'partCondition')
}

export function translateOriginalityConditions(t: Translator): Option[] {
  return relabel(ORIGINALITY_CONDITIONS, t, 'originality')
}

/** For Server Components and route handlers. */
export async function getVocabulary(projectType: ProjectType): Promise<VocabularyConfig> {
  const t = await getTranslations('vocab')
  return translateConfig(projectType, t as Translator)
}

/**
 * Every mode's vocabulary at once — for the screens that offer a choice
 * between them (the create form, the community filter) rather than
 * working inside one.
 */
export async function getAllVocabulary(): Promise<Record<ProjectType, VocabularyConfig>> {
  const t = await getTranslations('vocab')
  return {
    OFFROAD: translateConfig('OFFROAD', t as Translator),
    RESTORATION: translateConfig('RESTORATION', t as Translator),
    DAILY_DRIVER: translateConfig('DAILY_DRIVER', t as Translator),
  }
}

export async function getPartConditions(): Promise<Option[]> {
  const t = await getTranslations('vocab')
  return translatePartConditions(t as Translator)
}

export async function getOriginalityConditions(): Promise<Option[]> {
  const t = await getTranslations('vocab')
  return translateOriginalityConditions(t as Translator)
}

/**
 * For Client Components.
 *
 * A plain function call rather than a memo: `useTranslations` already
 * returns a stable translator, and rebuilding four short arrays on a
 * render is cheaper than the dependency array that would guard it.
 */
export function useVocabulary(projectType: ProjectType): VocabularyConfig {
  const t = useTranslations('vocab')
  return translateConfig(projectType, t as Translator)
}

export function useAllVocabulary(): Record<ProjectType, VocabularyConfig> {
  const t = useTranslations('vocab')
  return {
    OFFROAD: translateConfig('OFFROAD', t as Translator),
    RESTORATION: translateConfig('RESTORATION', t as Translator),
    DAILY_DRIVER: translateConfig('DAILY_DRIVER', t as Translator),
  }
}

export function usePartConditions(): Option[] {
  return translatePartConditions(useTranslations('vocab') as Translator)
}

export function useOriginalityConditions(): Option[] {
  return translateOriginalityConditions(useTranslations('vocab') as Translator)
}
