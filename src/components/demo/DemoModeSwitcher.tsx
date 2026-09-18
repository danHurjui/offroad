'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PROJECT_TYPES, statusBadgeClass, type ProjectType } from '@/lib/projectType'
import { useAllVocabulary } from '@/lib/vocabulary'

/**
 * The one interactive thing on the tour: pick a mode, watch the screen
 * change.
 *
 * This is the product's central claim — one app whose vocabulary
 * reconfigures itself — and it is the hardest thing to convey in a
 * sentence. Three paragraphs saying "the categories adapt" do less than a
 * button that swaps Suspension/Recovery/Lighting for Bodywork/Paint/Trim
 * in front of the reader.
 *
 * It renders from `useAllVocabulary()`, which reads `PROJECT_TYPE_CONFIG`
 * — the same source the real screens use — so this cannot show a
 * category the app doesn't have, and a mode added to the config appears
 * here without anyone remembering to come back. The only invented things
 * are the two sample numbers below.
 */

/**
 * Sample progress for the modes that track completion, and a sample job
 * count for the one that doesn't.
 *
 * `tracksCompletion` is the reason this component shows two different
 * things rather than a percentage everywhere: a repair log never
 * finishes, so claiming "62% complete" for a daily driver would advertise
 * a number the app deliberately refuses to show.
 */
const SAMPLE_PROGRESS_PCT = 62
const SAMPLE_JOB_COUNT = 34

export default function DemoModeSwitcher() {
  const t = useTranslations('demo')
  const vocabulary = useAllVocabulary()
  const [mode, setMode] = useState<ProjectType>('OFFROAD')
  const config = vocabulary[mode]

  return (
    <div>
      {/*
        Toggle buttons rather than a tablist: `aria-pressed` needs no
        arrow-key handling to be correct, and a tablist that only responds
        to Tab is a worse experience than no tab semantics at all.
      */}
      <div role="group" aria-label={t('modePreview.pick')} className="mb-4 flex flex-wrap gap-2">
        {PROJECT_TYPES.map((type) => {
          const selected = type === mode
          return (
            <button
              key={type}
              type="button"
              aria-pressed={selected}
              onClick={() => setMode(type)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                selected
                  ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-400/15 dark:text-brand-200'
                  : 'border-surface-border bg-surface text-ink-muted hover:text-ink'
              }`}
            >
              {vocabulary[type].label}
            </button>
          )
        })}
      </div>

      <div className="rounded-lg border border-surface-border bg-surface-muted p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-ink">{config.screenTitle}</h3>
          <span className="badge badge-brand">{config.label}</span>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink-muted">{config.progressLabel}</span>
            <span className="font-semibold text-ink">
              {config.tracksCompletion ? `${SAMPLE_PROGRESS_PCT}%` : SAMPLE_JOB_COUNT}
            </span>
          </div>
          {config.tracksCompletion && (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${SAMPLE_PROGRESS_PCT}%` }} />
            </div>
          )}
        </div>

        {/*
          Drawn, not interactive: nothing here submits anywhere, and a
          focusable button or input that does nothing is a trap for anyone
          arriving by keyboard. The CTA and the placeholder are shown
          together because the placeholder is the mode's worked example of
          what a "task" even means — which is the thing the wording of the
          button alone doesn't say.
        */}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="btn-primary pointer-events-none self-start whitespace-nowrap">
            {config.addTaskCta}
          </span>
          <span className="input flex-1 cursor-default select-none truncate text-ink-faint">
            {config.namePlaceholder}
          </span>
        </div>

        <div className="mt-4 border-t border-surface-border pt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {t('modePreview.categories')}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {config.categories.map((category) => (
              <span key={category.value} className="badge badge-neutral">
                {category.label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {t('modePreview.statuses')}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {config.statusTags.map((status) => (
              <span key={status.value} className={statusBadgeClass(config.statusTags, status.value)}>
                {status.label}
              </span>
            ))}
          </div>
        </div>

        <p className="mt-4 text-xs text-ink-muted">
          {t('modePreview.wishlistNote', { name: config.wishlistLabel })}
        </p>
      </div>
    </div>
  )
}
