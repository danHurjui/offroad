'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_OPTIONS, daysUntilMessage, getDocumentStatus, type DocumentStatus } from '@/lib/documents'
import { compressImageIfNeeded } from '@/lib/compressImage'
import MoneyInput from './MoneyInput'

interface DocumentRow {
  id: string
  type: string
  expiryDate: string
  fileUrl: string | null
  costRon: number | null
  paidAt: string | null
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
  const [newCost, setNewCost] = useState('')
  // RL-045: the price paid for the new period, entered with the renewal.
  const [renewCosts, setRenewCosts] = useState<Record<string, string>>({})
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [renewDrafts, setRenewDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  // Per row, because the three row actions used to fail in complete
  // silence: `if (res.ok)` with no else, so an oversized scan or a dropped
  // connection looked exactly like nothing having been clicked.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  async function failureMessage(res: Response, fallback: string) {
    const data = await res.json().catch(() => null)
    return typeof data?.error === 'string' ? data.error : fallback
  }

  function setRowError(id: string, message: string | null) {
    setRowErrors((prev) => {
      const next = { ...prev }
      if (message === null) delete next[id]
      else next[id] = message
      return next
    })
  }
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
      body: JSON.stringify({ type: newType, expiryDate: newExpiry, costRon: newCost || undefined }),
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
    setNewCost('')
    router.refresh()
  }

  async function onRenew(doc: DocumentRow) {
    const nextExpiry = renewDrafts[doc.id]
    if (!nextExpiry) return
    setBusyId(doc.id)
    const res = await fetch(`/api/vehicles/${vehicleId}/documents/${doc.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiryDate: nextExpiry, costRon: renewCosts[doc.id] || undefined }),
    })
    setBusyId(null)
    if (!res.ok) {
      setRowError(doc.id, await failureMessage(res, t('renewFailed')))
      return
    }
    setRowError(doc.id, null)
    const updated = await res.json()
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)))
    setRenewDrafts((prev) => ({ ...prev, [doc.id]: '' }))
    setRenewCosts((prev) => ({ ...prev, [doc.id]: '' }))
    router.refresh()
  }

  async function onAttachFile(doc: DocumentRow, file: File) {
    setBusyId(doc.id)
    setRowError(doc.id, null)
    const compressed = await compressImageIfNeeded(file) // no-op for PDFs
    const formData = new FormData()
    formData.append('file', compressed)
    const res = await fetch(`/api/vehicles/${vehicleId}/documents/${doc.id}/file`, { method: 'POST', body: formData })
    setBusyId(null)
    if (!res.ok) {
      // The server's own reason where there is one — a scan over the 4MB
      // ceiling is the common case and says so, in the reader's language.
      setRowError(doc.id, await failureMessage(res, t('attachFailed')))
      return
    }
    const updated = await res.json()
    setDocuments((prev) => prev.map((d) => (d.id === doc.id ? updated : d)))
    router.refresh()
  }

  async function onDelete(doc: DocumentRow) {
    if (!confirm(t('confirmDelete', { type: typeLabel(doc.type) }))) return
    setBusyId(doc.id)
    const res = await fetch(`/api/vehicles/${vehicleId}/documents/${doc.id}`, { method: 'DELETE' })
    setBusyId(null)
    // The row used to be dropped from the list whatever came back, so a
    // failed delete looked like a successful one until the next reload put
    // the document back.
    if (!res.ok) {
      setRowError(doc.id, await failureMessage(res, t('deleteFailed')))
      return
    }
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
        <div className="w-40">
          <label className="label" htmlFor="newCost">{t('price')}</label>
          <MoneyInput id="newCost" value={newCost} onChange={setNewCost} />
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
                  <div className="text-xs text-ink-faint">
                    {doc.costRon != null
                      ? t('paid', {
                          amount: doc.costRon.toLocaleString('ro-RO', { maximumFractionDigits: 2 }),
                          date: doc.paidAt ? new Date(doc.paidAt).toLocaleDateString('ro-RO', { timeZone: 'UTC' }) : '—',
                        })
                      : t('noPrice')}
                  </div>
                  {/* Said either way. A bare "View file" link that is simply
                      absent reads the same as a row that failed to attach,
                      which is how an upload could look like it had worked. */}
                  {doc.fileUrl ? (
                    <div className="text-xs">
                      <span className="text-green-700 dark:text-green-400">✓ {t('fileAttached')}</span>{' '}
                      <a href={`/api/uploads/${doc.fileUrl}`} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-300 hover:underline">
                        {t('viewFile')}
                      </a>
                    </div>
                  ) : (
                    <div className="text-xs text-ink-faint">{t('noFile')}</div>
                  )}
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  {/* The date box carried only an aria-label, so on screen it
                      was an unexplained second date picker sitting next to
                      Renew. It says what it is now. */}
                  <div>
                    <label className="label text-xs" htmlFor={`renew-${doc.id}`}>{t('renewLabel')}</label>
                    <input
                      id={`renew-${doc.id}`}
                      type="date"
                      className="input w-auto"
                      aria-label={t('newExpiryFor', { type: typeLabel(doc.type) })}
                      value={renewDrafts[doc.id] ?? ''}
                      onChange={(e) => setRenewDrafts((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                    />
                  </div>
                  {renewDrafts[doc.id] && (
                    <div className="w-36">
                      <label className="label text-xs" htmlFor={`renew-cost-${doc.id}`}>{t('renewPrice')}</label>
                      <MoneyInput
                        id={`renew-cost-${doc.id}`}
                        value={renewCosts[doc.id] ?? ''}
                        onChange={(v) => setRenewCosts((prev) => ({ ...prev, [doc.id]: v }))}
                      />
                    </div>
                  )}
                  <button type="button" className="btn-secondary" onClick={() => onRenew(doc)} disabled={busyId === doc.id || !renewDrafts[doc.id]}>
                    {t('renew')}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => fileInputRefs.current[doc.id]?.click()}
                    disabled={busyId === doc.id}
                  >
                    {busyId === doc.id ? t('attaching') : doc.fileUrl ? t('replaceFile') : t('attachFile')}
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
                {rowErrors[doc.id] && (
                  <p role="alert" className="w-full text-sm text-red-600 dark:text-red-400">{rowErrors[doc.id]}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
