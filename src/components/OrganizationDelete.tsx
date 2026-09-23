'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { tryFetch } from '@/lib/writeFeedback'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/** RL-038: delete an organisation (owners). Confirmed, not undoable — it takes every membership with it. */
export default function OrganizationDelete({ organizationId, name }: { organizationId: string; name: string }) {
  const t = useTranslations('organizations')
  const tc = useTranslations('common')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [busy, setBusy] = useState(false)

  async function onDelete() {
    if (!window.confirm(t('confirmDelete', { name }))) return
    setBusy(true)
    const res = await tryFetch(`/api/organizations/${organizationId}`, { method: 'DELETE' })
    setBusy(false)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('deleteFailed')))
      return
    }
    toast.success(t('deleted', { name }))
    router.push('/dashboard/organizations')
  }

  return (
    <button type="button" className="btn-danger" onClick={onDelete} disabled={busy}>
      {busy ? tc('deleting') : t('delete')}
    </button>
  )
}
