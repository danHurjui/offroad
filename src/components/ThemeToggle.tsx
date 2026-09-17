'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { applyTheme, readStoredTheme, type ThemePreference } from '@/lib/theme'

const OPTIONS: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'dark', label: 'Dark', icon: '☾' },
  { value: 'system', label: 'System', icon: '◐' },
]

/**
 * Three-way theme switch. Renders a stable placeholder until mounted:
 * the stored preference lives in localStorage, which the server can't
 * know, so rendering the real state on the first pass would be a
 * hydration mismatch.
 */
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const t = useTranslations('misc')
  const [preference, setPreference] = useState<ThemePreference>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setPreference(readStoredTheme())
    setMounted(true)
  }, [])

  // While on "system", track OS changes live instead of waiting for a reload.
  useEffect(() => {
    if (preference !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [preference])

  function choose(next: ThemePreference) {
    setPreference(next)
    applyTheme(next)
  }

  if (!mounted) {
    return <div className={compact ? 'h-8 w-8' : 'h-8 w-24'} aria-hidden />
  }

  if (compact) {
    // Header version: one button cycling light → dark → system.
    const current = OPTIONS.find((o) => o.value === preference) ?? OPTIONS[2]
    const next = OPTIONS[(OPTIONS.indexOf(current) + 1) % OPTIONS.length]
    return (
      <button
        type="button"
        onClick={() => choose(next.value)}
        title={`Theme: ${current.label} — switch to ${next.label}`}
        aria-label={`Theme: ${current.label}. Switch to ${next.label}.`}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      >
        <span aria-hidden>{current.icon}</span>
      </button>
    )
  }

  return (
    <div role="radiogroup" aria-label={t('theme')} className="inline-flex rounded-lg border border-surface-border p-0.5">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={preference === option.value}
          onClick={() => choose(option.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
            preference === option.value
              ? 'bg-brand-500 text-white'
              : 'text-ink-muted hover:bg-surface-subtle hover:text-ink'
          }`}
        >
          <span aria-hidden className="mr-1.5">
            {option.icon}
          </span>
          {option.label}
        </button>
      ))}
    </div>
  )
}
