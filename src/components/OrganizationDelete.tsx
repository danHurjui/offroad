'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { tryFetch } from '@/lib/writeFeedback'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/**
 * RL-038: delete an organisation (owners). Not undoable. With vehicles it
 * deletes them and all their records too, so the name has to be typed —
 * the server checks the same thing.
 */
export default function OrganizationDelete({ organizationId, name, vehicleCount }: { organizationId: string; name: string; vehicleCount: number }) {
  const t = useTranslations('organizations')
  const tc = useTranslations('common')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [busy, setBusy] = useState(false)
  const [typed, setTyped] = useState('')
  const needsName = vehicleCount > 0

  async function onDelete() {
    if (!needsName && !window.confirm(t('confirmDelete', { name }))) return
    setBusy(true)
    const res = await tryFetch(`/api/organizations/${organizationId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(needsName ? { confirmName: typed } : {}),
    })
    setBusy(false)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('deleteFailed')))
      return
    }
    toast.success(t('deleted', { name }))
    router.push('/dashboard/organizations')
  }

  return (
    <div className="space-y-3">
      {needsName && (
        <>
          <p className="note-warn rounded p-2 text-xs">{t('deleteVehiclesWarning', { count: vehicleCount })}</p>
          <div>
            <label className="label" htmlFor="org-delete-name">{t('deleteTypeName', { name })}</label>
            <input id="org-delete-name" className="input" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        </>
      )}
      <button type="button" className="btn-danger" onClick={onDelete} disabled={busy || (needsName && typed.trim() !== name.trim())}>
        {busy ? tc('deleting') : t('delete')}
      </button>
    </div>
  )
}
