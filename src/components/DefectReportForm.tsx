'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { compressImageIfNeeded } from '@/lib/compressImage'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/**
 * RL-040: report a defect from the road. Not a separate kind of record: an
 * ordinary job through the normal create route, with the mode's defect
 * category and a status that reads as needing attention on the manager's
 * garage (`config.defect`). No cost fields — reporting is not paying.
 * Built for a phone: two fields and the camera.
 */
export default function DefectReportForm({
  vehicleId,
  defect,
}: {
  vehicleId: string
  defect: { category: string; status: string; photoType: string }
}) {
  const t = useTranslations('defect')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        notes: notes.trim() || undefined,
        category: defect.category,
        status: defect.status,
        workType: 'DIY',
        date: new Date().toISOString().slice(0, 10),
      }),
    })
    if (!res?.ok) {
      setBusy(false)
      setError(await reasonFor(res, t('failed')))
      return
    }
    const task = await res.json().catch(() => null)
    if (photo && task?.id) {
      const form = new FormData()
      form.append('file', await compressImageIfNeeded(photo))
      form.append('photoType', defect.photoType)
      const up = await tryFetch(`/api/vehicles/${vehicleId}/tasks/${task.id}/photos`, { method: 'POST', body: form })
      // The report is saved either way; a failed photo is said, not hidden.
      if (!up?.ok) toast.error(await reasonFor(up, t('photoFailed')))
    }
    setBusy(false)
    toast.success(t('reported'))
    router.push(`/dashboard/vehicles/${vehicleId}`)
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5">
      <div>
        <label className="label" htmlFor="defect-name">{t('what')}</label>
        <input
          id="defect-name" className="input" required maxLength={200} value={name}
          onChange={(e) => setName(e.target.value)} placeholder={t('whatPlaceholder')} aria-describedby="defect-error"
        />
      </div>
      <div>
        <label className="label" htmlFor="defect-notes">{t('details')}</label>
        <textarea id="defect-notes" className="input min-h-24" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor="defect-photo">{t('photo')}</label>
        <input
          id="defect-photo" type="file" accept="image/*" capture="environment" className="block w-full text-sm text-ink"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
      </div>
      <FormError id="defect-error">{error}</FormError>
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={busy || !name.trim()}>
        {busy ? t('sending') : t('submit')}
      </button>
    </form>
  )
}
