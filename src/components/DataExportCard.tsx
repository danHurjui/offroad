'use client'

import Link from 'next/link'
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
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onExport() {
    setError(null)
    setWorking(true)
    try {
      const res = await fetch('/api/me/export')
      if (!res.ok) {
        if (res.status === 429) {
          setError('You have requested this a few times just now. Please try again a little later.')
        } else {
          setError('Could not build the export. Please try again.')
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
      setError('Could not reach the server. Please check your connection and try again.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="card space-y-3 p-6">
      <h2 className="font-semibold text-ink">Your data</h2>
      <p className="text-sm text-ink-muted">
        Download everything RigLog holds about your account — your profile, every vehicle, task,
        cost, document and wishlist item, plus what you have posted publicly. It arrives as JSON, so
        another tool can read it.
      </p>
      <p className="text-xs text-ink-faint">
        Photos and files aren&rsquo;t inside the download — a build&rsquo;s photos can run to
        hundreds of megabytes. The export lists them so you can match a file to the entry that used
        it, and each one is downloadable from its own page.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={onExport} disabled={working}>
          {working ? 'Preparing…' : 'Download my data'}
        </button>
        <Link href="/privacy" className="text-sm text-brand-600 dark:text-brand-300 hover:underline">
          What we store and why
        </Link>
      </div>
      <FormError>{error}</FormError>
    </div>
  )
}
