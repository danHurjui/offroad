'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { compressImageIfNeeded } from '@/lib/compressImage'
import { HANDOVER_PHOTO_LIMIT } from '@/lib/assignments'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/**
 * RL-040: one end of a handover — the km and condition photos. `start` is
 * taking the vehicle (for an assignment made without a km); `end` is
 * handing it back, which ends the assignment. Photos go first, while the
 * driver still has access; the km is checked against the mileage history
 * and a refusal says which reading it collides with.
 */
export default function HandoverForm({
  vehicleId,
  assignmentId,
  stage,
}: {
  vehicleId: string
  assignmentId: string
  stage: 'start' | 'end'
}) {
  const t = useTranslations('handover')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [km, setKm] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const base = `/api/vehicles/${vehicleId}/assignments/${assignmentId}`

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (stage === 'end' && !window.confirm(t('confirmEnd'))) return
    setBusy(true)
    setError(null)
    for (const file of photos) {
      const form = new FormData()
      form.append('file', await compressImageIfNeeded(file))
      form.append('stage', stage === 'start' ? 'START' : 'END')
      const up = await tryFetch(`${base}/photos`, { method: 'POST', body: form })
      if (!up?.ok) {
        setBusy(false)
        setError(await reasonFor(up, t('photoFailed')))
        return
      }
    }
    const res = await tryFetch(`${base}/${stage}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ km }),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('failed')))
      return
    }
    toast.success(t(stage === 'start' ? 'started' : 'ended'))
    if (stage === 'end') router.push('/dashboard')
    router.refresh()
  }

  const id = `handover-${stage}`
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="label" htmlFor={`${id}-km`}>{t('km')}</label>
        <input
          id={`${id}-km`} className="input" inputMode="numeric" pattern="[0-9]*" required value={km}
          onChange={(e) => setKm(e.target.value.replace(/[^0-9]/g, ''))} aria-describedby={`${id}-error`}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${id}-photos`}>{t('photos', { limit: HANDOVER_PHOTO_LIMIT })}</label>
        <input
          id={`${id}-photos`} type="file" accept="image/*" capture="environment" multiple className="block w-full text-sm text-ink"
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []).slice(0, HANDOVER_PHOTO_LIMIT))}
        />
        {photos.length > 0 && <p className="mt-1 text-xs text-ink-muted">{t('photosChosen', { count: photos.length })}</p>}
      </div>
      <FormError id={`${id}-error`}>{error}</FormError>
      <button type="submit" className={stage === 'end' ? 'btn-secondary w-full sm:w-auto' : 'btn-primary w-full sm:w-auto'} disabled={busy || !km}>
        {busy ? t('saving') : t(stage === 'start' ? 'submitStart' : 'submitEnd')}
      </button>
    </form>
  )
}
