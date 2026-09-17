'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import FormError from './FormError'
import { useState } from 'react'

/**
 * GDPR Art. 15/20: take a copy of everything.
 *
 * It fetches rather than pointing an <a download> at the endpoint, because
 * the export can take a few seconds on a big account and a plain link
 * gives no sign that anything is happening — people click it twice and
 * then assume it is broken. Fetching lets the button say so, and lets a
 * 429 or a 500 surface as a message instead of a downloaded error page.
 */
export default function DataExportCard() {
  const t = useTranslations('dataExport')
  const tc = useTranslations('common')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onExport() {
    setError(null)
    setWorking(true)
    try {
      const res = await fetch('/api/me/export')
      if (!res.ok) {
        if (res.status === 429) {
          setError(t('rateLimited'))
        } else {
          setError(t('failed'))
        }
        return
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `riglog-data-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Revoking frees the blob; without it the whole export stays in
      // memory until the tab is closed.
      URL.revokeObjectURL(url)
    } catch {
      setError(tc('networkError'))
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="card space-y-3 p-6">
      <h2 className="font-semibold text-ink">{t('title')}</h2>
      <p className="text-sm text-ink-muted">
        {t('intro')}
      </p>
      <p className="text-xs text-ink-faint">
        {t('filesNote')}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={onExport} disabled={working}>
          {working ? t('preparing') : t('download')}
        </button>
        <Link href="/privacy" className="text-sm text-brand-600 dark:text-brand-300 hover:underline">
          {t('whatWeStore')}
        </Link>
      </div>
      <FormError>{error}</FormError>
    </div>
  )
}
