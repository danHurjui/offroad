'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { tryFetch } from '@/lib/writeFeedback'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/**
 * RL-038: move a personal vehicle into an organisation where the owner is
 * an owner or fleet manager. Confirmed, because it is one-way for now and
 * changes who can see the vehicle.
 */
export default function MoveToOrganization({
  vehicleId,
  organizations,
  isPublic,
}: {
  vehicleId: string
  organizations: Array<{ id: string; name: string }>
  isPublic: boolean
}) {
  const t = useTranslations('organizations.move')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? '')
  const [busy, setBusy] = useState(false)

  async function onMove() {
    const name = organizations.find((o) => o.id === organizationId)?.name ?? ''
    if (!window.confirm(t('confirm', { name }))) return
    setBusy(true)
    const res = await tryFetch(`/api/vehicles/${vehicleId}/organization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ organizationId }),
    })
    setBusy(false)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('failed')))
      return
    }
    toast.success(t('moved', { name }))
    router.refresh()
  }

  return (
    <section className="card mt-6 p-5">
      <h2 className="mb-1 text-sm font-semibold text-ink">{t('title')}</h2>
      <p className="mb-3 text-xs text-ink-muted">{t('help')}</p>
      {isPublic && <p className="note-warn mb-3 rounded p-2 text-xs">{t('unpublishes')}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="label" htmlFor="move-org">{t('organization')}</label>
          <select id="move-org" className="input" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-secondary" disabled={busy || !organizationId} onClick={onMove}>
          {busy ? t('moving') : t('submit')}
        </button>
      </div>
    </section>
  )
}
