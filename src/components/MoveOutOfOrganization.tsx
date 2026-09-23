'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { tryFetch } from '@/lib/writeFeedback'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/** RL-038: move a company vehicle out, into the caller's own garage (owners and fleet managers). */
export default function MoveOutOfOrganization({ vehicleId, organizationName }: { vehicleId: string; organizationName: string }) {
  const t = useTranslations('organizations.moveOut')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [busy, setBusy] = useState(false)

  async function onMove() {
    if (!window.confirm(t('confirm', { name: organizationName }))) return
    setBusy(true)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/organization`, { method: 'DELETE' })
    setBusy(false)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('failed')))
      return
    }
    toast.success(t('moved'))
    router.refresh()
  }

  return (
    <section className="card mt-6 p-5">
      <h2 className="mb-1 text-sm font-semibold text-ink">{t('title')}</h2>
      <p className="mb-3 text-xs text-ink-muted">{t('help', { name: organizationName })}</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={onMove}>
        {busy ? t('moving') : t('submit')}
      </button>
    </section>
  )
}
