'use client'

import { useTranslations } from 'next-intl'

import { useState } from 'react'

// RL-014/RL-033: fetches the PDF as a blob (rather than a plain <a href>
// link) so we can also offer the Web Share API — a straight navigation
// can't hand the browser a File object to share.
export default function ExportPdfButton({ endpoint, fallbackName }: { endpoint: string; fallbackName: string }) {
  const t = useTranslations('misc')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchPdf(): Promise<{ blob: Blob; filename: string } | null> {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(endpoint)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? t('pdfFailed'))
        return null
      }
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const match = disposition.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `${fallbackName.replace(/\s+/g, '_')}.pdf`
      const blob = await res.blob()
      return { blob, filename }
    } catch {
      setError(t('pdfFailed'))
      return null
    } finally {
      setLoading(false)
    }
  }

  async function onDownload() {
    const result = await fetchPdf()
    if (!result) return
    const url = URL.createObjectURL(result.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function onShare() {
    const result = await fetchPdf()
    if (!result) return
    const file = new File([result.blob], result.filename, { type: 'application/pdf' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: result.filename })
      } catch {
        // user cancelled the share sheet — not an error
      }
    } else {
      setError(t('shareUnsupported'))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={onDownload} disabled={loading}>
          {loading ? t('generating') : t('downloadPdf')}
        </button>
        <button type="button" className="btn-secondary" onClick={onShare} disabled={loading}>
          {t('share')}
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
