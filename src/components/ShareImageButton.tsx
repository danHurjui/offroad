'use client'

import { useState } from 'react'

// RL-020/RL-021: fetches the PNG as a blob (rather than a plain <a href>
// link) for the same reason as ExportPdfButton — Web Share API needs an
// actual File object.
export default function ShareImageButton({ endpoint, fallbackName }: { endpoint: string; fallbackName: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchImage(): Promise<{ blob: Blob; filename: string } | null> {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(endpoint)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Could not generate card')
        return null
      }
      const blob = await res.blob()
      return { blob, filename: `${fallbackName.replace(/\s+/g, '_')}.png` }
    } catch {
      setError('Could not generate card')
      return null
    } finally {
      setLoading(false)
    }
  }

  async function onDownload() {
    const result = await fetchImage()
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
    const result = await fetchImage()
    if (!result) return
    const file = new File([result.blob], result.filename, { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: result.filename })
      } catch {
        // user cancelled the share sheet — not an error
      }
    } else {
      setError('Sharing is not supported on this device — use Download instead.')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={onDownload} disabled={loading}>
          {loading ? 'Generating…' : 'Download PNG'}
        </button>
        <button type="button" className="btn-secondary" onClick={onShare} disabled={loading}>
          Share
        </button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
