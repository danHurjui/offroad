'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { tryFetch } from '@/lib/writeFeedback'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/** RL-050: what can be done to one tyre set from its row. */
export function TyreSetActions({
  vehicleId,
  setId,
  isFitted,
  canRemove,
}: {
  vehicleId: string
  setId: string
  isFitted: boolean
  canRemove: boolean
}) {
  const t = useTranslations('tyres')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const [tread, setTread] = useState('')
  const [busy, setBusy] = useState(false)
  const url = `/api/vehicles/${vehicleId}/tyres/${setId}`

  async function patch(body: Record<string, unknown>, success: string) {
    setBusy(true)
    const res = await tryFetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(false)
    if (!res?.ok) {
      toast.error(await reasonFor(res, t('failed')))
      return
    }
    toast.success(success)
    setTread('')
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void patch({ treadDepthMm: tread }, t('treadSaved'))
        }}
      >
        <label className="sr-only" htmlFor={`tread-${setId}`}>{t('tread')}</label>
        <input
          id={`tread-${setId}`}
          type="number"
          inputMode="decimal"
          min={0}
          max={20}
          step={0.1}
          required
          placeholder="mm"
          className="input w-20"
          value={tread}
          onChange={(e) => setTread(e.target.value)}
        />
        <button type="submit" className="btn-secondary" disabled={busy}>{t('treadUpdate')}</button>
      </form>
      {!isFitted && (
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => patch({ isFitted: true }, t('fittedDone'))}>
          {t('markFitted')}
        </button>
      )}
      {canRemove && (
        <button
          type="button"
          className="text-sm text-red-600 hover:underline dark:text-red-400"
          onClick={() =>
            toast.undoable({
              key: `tyres:${setId}`,
              message: t('deleted'),
              request: { url, method: 'DELETE' },
              onCommitted: () => router.refresh(),
              onFailed: async (res) => toast.error(await reasonFor(res, t('deleteFailed'))),
            })
          }
        >
          {t('remove')}
        </button>
      )}
    </div>
  )
}

export function TyreRow({ setId, children }: { setId: string; children: React.ReactNode }) {
  return <HideWhilePending pendingKey={`tyres:${setId}`}>{children}</HideWhilePending>
}
