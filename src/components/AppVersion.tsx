'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { BUILD_TIME, versionLabel } from '@/lib/version'

/**
 * The build this browser is running, in a form somebody can paste into a
 * bug report.
 *
 * Client-side on purpose even though the values are build-time constants:
 * what matters is the version of the **bundle that is executing**, and on
 * a PWA with a stale cache that can be older than the server's. Rendering
 * it from a Server Component would print the server's answer under the
 * user's nose, which is the exact confusion this is here to remove.
 */
export default function AppVersion({ className = '' }: { className?: string }) {
  const t = useTranslations('version')
  const [copied, setCopied] = useState(false)
  const label = versionLabel()

  // No guess, no placeholder. A version invented here gets quoted back in
  // a bug report as though it were a fact.
  if (!label) {
    return <span className={`text-xs text-ink-faint ${className}`}>{t('unknown')}</span>
  }

  const built = BUILD_TIME ? new Date(BUILD_TIME) : null

  async function copy() {
    try {
      await navigator.clipboard.writeText(label!)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Blocked clipboard, or an insecure context. The string is on
      // screen and selectable either way, so this is not worth a message.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={
        built ? t('builtOn', { date: built.toLocaleString() }) : t('copy')
      }
      className={`rounded px-1 py-0.5 font-mono text-xs text-ink-faint transition-colors hover:bg-surface-subtle hover:text-ink-muted ${className}`}
    >
      {copied ? t('copied') : label}
    </button>
  )
}
