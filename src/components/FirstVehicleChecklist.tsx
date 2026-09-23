'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { OnboardingStep } from '@/lib/onboarding'
import FormError from './FormError'

export interface ChecklistStep {
  id: OnboardingStep
  done: boolean
  /** Null while an earlier step is missing — there is no vehicle to link into yet. */
  href: string | null
}

/**
 * RL-036: the getting-started list on the dashboard. What each step means
 * and when the whole thing goes away is decided in src/lib/onboarding.ts;
 * this only renders it and sends the Hide.
 */
export default function FirstVehicleChecklist({ steps }: { steps: ChecklistStep[] }) {
  const t = useTranslations('dashboard.checklist')
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  if (hidden) return null

  const doneCount = steps.filter((s) => s.done).length

  async function dismiss() {
    setBusy(true)
    setError(false)
    const res = await fetch('/api/me/onboarding/dismiss', { method: 'POST' }).catch(() => null)
    setBusy(false)
    if (res?.ok) setHidden(true)
    else setError(true)
  }

  return (
    <section className="card mb-6 p-4" aria-labelledby="checklist-title">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="checklist-title" className="font-semibold text-ink">
            {t('title')}
          </h2>
          <p className="text-sm text-ink-muted">{t('progress', { done: doneCount, total: steps.length })}</p>
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0"
          onClick={dismiss}
          disabled={busy}
          aria-label={t('dismissLabel')}
          aria-describedby={error ? 'checklist-error' : undefined}
        >
          {t('dismiss')}
        </button>
      </div>
      {error && <FormError id="checklist-error">{t('dismissFailed')}</FormError>}
      <ol className="space-y-2">
        {steps.map((step, index) => {
          const label = t(`step.${step.id}`)
          return (
            <li key={step.id} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  step.done ? 'badge-success' : 'bg-surface-subtle text-ink-muted'
                }`}
              >
                {step.done ? '✓' : index + 1}
              </span>
              {step.done ? (
                <span className="text-ink-muted line-through">
                  {label}
                  <span className="sr-only"> — {t('done')}</span>
                </span>
              ) : step.href ? (
                <Link href={step.href} className="text-brand-600 hover:underline dark:text-brand-300">
                  {label}
                </Link>
              ) : (
                <span className="text-ink">{label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
