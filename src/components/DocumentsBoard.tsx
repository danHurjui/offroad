'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DOCUMENT_TYPE_OPTIONS, formatDaysUntil, getDocumentStatus, type DocumentStatus } from '@/lib/documents'
import { labelFor } from '@/lib/projectType'
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
const STATUS_LABELS: Record<DocumentStatus, string> = {
  valid: 'Valid',
  expiring: 'Expiring soon',
  expired: 'Expired',
}

// RL-013: colour-coded document list (valid/expiring <30d/expired),
// add, renew (update expiry date — re-arms reminders server-side), and
// attach a scan/photo per document.
export default function DocumentsBoard({ vehicleId, documents: initialDocuments }: { vehicleId: string; documents: DocumentRow[] }) {
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
      setError('Expiry date is required')
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
    if (!confirm(`Delete this ${labelFor(DOCUMENT_TYPE_OPTIONS, doc.type)} record?`)) return
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
          <label className="label" htmlFor="newType">Document type</label>
          <select id="newType" className="input" value={newType} onChange={(e) => setNewType(e.target.value)}>
            {DOCUMENT_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="newExpiry">Expiry date</label>
          <input id="newExpiry" type="date" className="input" value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} required />
        </div>
        <button type="submit" className="btn-primary" disabled={adding}>
          {adding ? 'Adding…' : '+ Add document'}
        </button>
        {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
      </form>

      {documents.length === 0 ? (
        <div className="card p-10 text-center text-ink-muted">No documents tracked yet.</div>
      ) : (
        <div className="card divide-y divide-surface-border">
          {documents.map((doc) => {
            const { daysUntil, status } = getDocumentStatus(new Date(doc.expiryDate))
            return (
              <div key={doc.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-[10rem] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink">{labelFor(DOCUMENT_TYPE_OPTIONS, doc.type)}</span>
                    <span className={`badge ${STATUS_STYLES[status]}`}>{STATUS_LABELS[status]}</span>
                  </div>
                  <div className="text-xs text-ink-faint">
                    {new Date(doc.expiryDate).toLocaleDateString('ro-RO')} · {formatDaysUntil(daysUntil)}
                  </div>
                  {doc.fileUrl && (
                    <a href={`/api/uploads/${doc.fileUrl}`} target="_blank" rel="noreferrer" className="text-xs text-brand-600 dark:text-brand-300 hover:underline">
                      View attached file
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    className="input w-auto"
                    aria-label={`New expiry date for ${labelFor(DOCUMENT_TYPE_OPTIONS, doc.type)}`}
                    value={renewDrafts[doc.id] ?? ''}
                    onChange={(e) => setRenewDrafts((prev) => ({ ...prev, [doc.id]: e.target.value }))}
                  />
                  <button type="button" className="btn-secondary" onClick={() => onRenew(doc)} disabled={busyId === doc.id || !renewDrafts[doc.id]}>
                    Renew
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => fileInputRefs.current[doc.id]?.click()}
                    disabled={busyId === doc.id}
                  >
                    {doc.fileUrl ? 'Replace file' : 'Attach file'}
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
                    Delete
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
