'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { tryFetch } from '@/lib/writeFeedback'
import FormError from './FormError'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

interface ActiveLink {
  id: string
  token: string
  showPlate: boolean
  showVin: boolean
  showCosts: boolean
  createdAt: string
}

/**
 * RL-049: share the passport by link, and take it back. Plate and VIN are
 * asked for, never assumed (RL-050). Making a new link withdraws the old
 * one, so what a buyer can read is always what this screen shows.
 */
export default function PassportShare({
  vehicleId,
  active,
  isPro,
  hasPlate,
  hasVin,
}: {
  vehicleId: string
  active: ActiveLink | null
  isPro: boolean
  hasPlate: boolean
  hasVin: boolean
}) {
  const t = useTranslations('passport')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [showPlate, setShowPlate] = useState(active?.showPlate ?? false)
  const [showVin, setShowVin] = useState(active?.showVin ?? false)
  const [showCosts, setShowCosts] = useState(active?.showCosts ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The origin is only known in the browser; the path is what matters.
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])
  const url = active ? `${origin}/passport/${active.token}` : null

  async function create() {
    setBusy(true)
    setError(null)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/passport-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ showPlate, showVin, showCosts }),
    })
    setBusy(false)
    if (!res?.ok) {
      setError(await reasonFor(res, t('shareFailed')))
      return
    }
    toast.success(t(active ? 'linkReplaced' : 'linkCreated'))
    router.refresh()
  }

  async function withdraw() {
    if (!active) return
    setBusy(true)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/passport-links/${active.id}`, { method: 'DELETE' })
    setBusy(false)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('withdrawFailed')))
      return
    }
    toast.success(t('withdrawn'))
    router.refresh()
  }

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('copied'))
    } catch {
      toast.error(t('copyFailed'))
    }
  }

  const options = (
    <fieldset className="space-y-2 text-sm text-ink">
      <legend className="mb-1 font-medium">{t('includeLegend')}</legend>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={showPlate} disabled={!hasPlate} onChange={(e) => setShowPlate(e.target.checked)} />
        {t('includePlate')}
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={showVin} disabled={!hasVin} onChange={(e) => setShowVin(e.target.checked)} />
        {t('includeVin')}
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={showCosts} onChange={(e) => setShowCosts(e.target.checked)} />
        {t('includeCosts')}
      </label>
    </fieldset>
  )

  return (
    <div className="space-y-3">
      {active && url && (
        <div className="space-y-2">
          <p className="text-sm text-ink">{t('liveLink')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={url} className="input min-w-0 flex-1 font-mono text-xs" aria-label={t('liveLink')} onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-secondary" onClick={copy}>{t('copy')}</button>
            <button type="button" className="btn-danger" onClick={withdraw} disabled={busy}>{t('withdraw')}</button>
          </div>
          <p className="text-xs text-ink-faint">{t('liveLinkHelp')}</p>
        </div>
      )}
      {isPro ? (
        <>
          {options}
          <FormError>{error}</FormError>
          <button type="button" className={active ? 'btn-secondary' : 'btn-primary'} onClick={create} disabled={busy}>
            {active ? t('replaceLink') : t('createLink')}
          </button>
        </>
      ) : (
        !active && <p className="text-sm text-ink-muted">{t('sharePro')}</p>
      )}
    </div>
  )
}
