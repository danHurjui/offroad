'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

// RL-016: one receipt/document scan per task.
export default function TaskReceipt({
  vehicleId,
  taskId,
  receiptUrl,
  canEdit,
}: {
  vehicleId: string
  taskId: string
  receiptUrl: string | null
  canEdit: boolean
}) {
  const t = useTranslations('receipt')
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/vehicles/${vehicleId}/tasks/${taskId}/receipt`, { method: 'POST', body: formData })
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? t('uploadFailed'))
      return
    }
    router.refresh()
  }

  async function onDelete() {
    if (!confirm(t('confirmRemove'))) return
    await fetch(`/api/vehicles/${vehicleId}/tasks/${taskId}/receipt`, { method: 'DELETE' })
    router.refresh()
  }

  const isPdf = receiptUrl?.toLowerCase().endsWith('.pdf')

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {canEdit && (
          <label className="btn-secondary cursor-pointer">
            {uploading ? t('uploading') : receiptUrl ? t('replace') : t('attach')}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/heic,application/pdf"
              className="hidden"
              onChange={onFileChange}
              disabled={uploading}
            />
          </label>
        )}
        {canEdit && receiptUrl && (
          <button type="button" className="btn-danger" onClick={onDelete}>
            {t('remove')}
          </button>
        )}
      </div>
      {error && <p className="mb-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {receiptUrl ? (
        isPdf ? (
          <a href={`/api/uploads/${receiptUrl}`} target="_blank" rel="noreferrer" className="text-sm text-brand-600 dark:text-brand-300 hover:underline">
            {t('viewPdf')}
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/uploads/${receiptUrl}`} alt="Receipt" className="max-h-64 rounded-lg border border-surface-border object-contain" />
        )
      ) : (
        <p className="text-sm text-ink-faint">{t('none')}</p>
      )}
    </div>
  )
}
