'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_OPTIONS, daysUntilMessage, getDocumentStatus, type DocumentStatus } from '@/lib/documents'
import { compressImageIfNeeded } from '@/lib/compressImage'

interface DocumentRow {
  id: string
  type: string
  expiryDate: string
  fileUrl: string | null
}

const STATUS_STYLES: Record<DocumentStatus, string> = {
  valid: 'badge-success',
  expiring: 'badge-warn',
  expired: 'badge-danger',
}
// RL-013: colour-coded document list (valid/expiring <30d/expired),
// add, renew (update expiry date — re-arms reminders server-side), and
// attach a scan/photo per document.
export default function DocumentsBoard({ vehicleId, documents: initialDocuments }: { vehicleId: string; documents: DocumentRow[] }) {
  const t = useTranslations('documents')
  const tc = useTranslations('common')
  // Document names are catalogue lookups by value rather than the config's
  // own labels: ITP and RCA are Romanian legal documents, and their English
  // gloss ("technical inspection") is what an English reader needs.
  const typeLabel = (value: string) => t(`type.${value}`)
  const router = useRouter()
  const [documents, setDocuments] = useState(initialDocuments)
  const [newType, setNewType] = useState(DOCUMENT_TYPE_OPTIONS[0].value)
  const [newExpiry, setNewExpiry] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renewDrafts, setRenewDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function onAdd(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!newExpiry) {
      setError(t('expiryRequired'))
      return
    }
    setAdding(true)
    const res = await fetch(`/api/vehicles/${vehicleId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: newType, expiryDate: newExpiry }),
    })
    setAdding(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? 'Could not add document')
      return
    }
    const created = await res.json()
    setDocuments((prev) => [...prev, created].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)))
    setNewExpiry('')
    router.refresh()
  }

  async function onRenew(doc: DocumentRow) {
    const nextExpiry = renewDrafts[doc.id]
    if (!nextExpiry) return
    setBusyId(doc.id)
    const res = await fetch(`/api/vehicles/${vehicleId}/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiryDate: nextExpiry }),
    })
    setBusyId(null)
    if (res.ok) {
      const updated = await res.json()
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)))
      setRenewDrafts((prev) => ({ ...prev, [doc.id]: '' }))
      router.refresh()
    }
  }

  async function onAttachFile(doc: DocumentRow, file: File) {
    setBusyId(doc.id)
    const compressed = await compressImageIfNeeded(file) // no-op for PDFs
    const formData = new FormData()
    formData.append('file', compressed)
    const res = await fetch(`/api/vehicles/${vehicleId}/documents/${doc.id}/file`, { method: 'POST', body: formData })
    setBusyId(null)
    if (res.ok) {
      const updated = await res.json()
      setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)))
      router.refresh()
    }
  }

  async function onDelete(doc: DocumentRow) {
    if (!confirm(t('confirmDelete', { type: typeLabel(doc.type) }))) return
    setBusyId(doc.id)
    await fetch(`/api/vehicles/${vehicleId}/documents/${doc.id}`, { method: 'DELETE' })
    setBusyId(null)
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    router.refresh()
  }

  return (
    <div>
      <form onSubmit={onAdd} className="card mb-6 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="label" htmlFor="newType">{t('documentType')}</label>
          <select id="newType" className="input" value={newType} onChange={(e) => setNewType(e.target.value)}>
            {DOCUMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {typeLabel(option.value)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="newExpiry">{t('expiryDate')}</label>
          <input id="newExpiry" type="date" className="input" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} required />
        </div>
        <button type="submit" className="btn-primary" disabled={adding}>
          {adding ? t('adding') : t('addDocument')}
        </button>
        {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>

      {documents.length === 0 ? (
        <div className="card p-10 text-center text-ink-muted">{t('empty')}</div>
      ) : (
        <div className="card divide-y divide-surface-border">
          {documents.map((doc) => {
            const { daysUntil, status } = getDocumentStatus(new Date(doc.expiryDate))
            return (
              <div key={doc.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-[10rem] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{typeLabel(doc.type)}</span>
                    <span className={`badge ${STATUS_STYLES[status]}`}>{t(`status.${status}`)}</span>
                  </div>
                  <div className="text-xs text-ink-faint">
                    {new Date(doc.expiryDate).toLocaleDateString('ro-RO')} ·{' '}
                    {t(daysUntilMessage(daysUntil).key, daysUntilMessage(daysUntil).values)}
                  </div>
                  {doc.fileUrl && (
                    <a href={`/api/uploads/${doc.fileUrl}`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 dark:text-brand-300 hover:underline">
                      {t('viewFile')}
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    className="input w-auto"
                    aria-label={t('newExpiryFor', { type: typeLabel(doc.type) })}
                    value={renewDrafts[doc.id] ?? ''}
                    onChange={(e) => setRenewDrafts((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                  />
                  <button type="button" className="btn-secondary" onClick={() => onRenew(doc)} disabled={busyId === doc.id || !renewDrafts[doc.id]}>
                    {t('renew')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => fileInputRefs.current[doc.id]?.click()}
                    disabled={busyId === doc.id}
                  >
                    {doc.fileUrl ? t('replaceFile') : t('attachFile')}
                  </button>
                  <input
                    ref={(el) => { fileInputRefs.current[doc.id] = el }}
                    type="file"
                    accept="image/jpeg,image/png,image/heic,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) onAttachFile(doc, file)
                      e.target.value = ''
                    }}
                  />
                  <button type="button" className="btn-danger" onClick={() => onDelete(doc)} disabled={busyId === doc.id}>
                    {tc('delete')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
