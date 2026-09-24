'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'
import BatteryReadingForm, { type EditableReading } from './BatteryReadingForm'

/** RL-056: remove a battery reading with Undo rather than a confirm (RL-034). */
export function RemoveBatteryReadingButton({ vehicleId, readingId, dateLabel }: { vehicleId: string; readingId: string; dateLabel: string }) {
  const t = useTranslations('battery')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  return (
    <button
      type="button"
      className="text-sm text-red-600 hover:underline dark:text-red-400"
      onClick={() =>
        toast.undoable({
          key: `battery:${readingId}`,
          message: t('deleted', { date: dateLabel }),
          request: { url: `/api/vehicles/${vehicleId}/battery/${readingId}`, method: 'DELETE' },
          onCommitted: () => router.refresh(),
          onFailed: async (res) => toast.error(await reasonFor(res, t('deleteFailed'))),
        })
      }
    >
      {t('remove')}
    </button>
  )
}

export function BatteryReadingRow({ readingId, children }: { readingId: string; children: React.ReactNode }) {
  return <HideWhilePending pendingKey={`battery:${readingId}`}>{children}</HideWhilePending>
}

/**
 * One reading in the list: what was recorded, and — for the owner or the
 * person who entered it — Edit (the add form, correcting this reading in
 * place) and Remove (with Undo).
 */
export function BatteryReadingItem({
  vehicleId,
  reading,
  dateLabel,
  reportUrl,
  canChange,
  children,
}: {
  vehicleId: string
  reading: EditableReading
  dateLabel: string
  reportUrl: string | null
  canChange: boolean
  children: React.ReactNode
}) {
  const t = useTranslations('battery')
  const [editing, setEditing] = useState(false)
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">{children}</div>
        <div className="flex shrink-0 items-center gap-3">
          {reportUrl && (
            <a href={`/api/uploads/${reportUrl}`} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline dark:text-brand-300">
              {t('viewReport')}
            </a>
          )}
          {canChange && !editing && (
            <button type="button" className="text-sm text-brand-600 hover:underline dark:text-brand-300" onClick={() => setEditing(true)}>
              {t('edit')}
            </button>
          )}
          {canChange && <RemoveBatteryReadingButton vehicleId={vehicleId} readingId={reading.id} dateLabel={dateLabel} />}
        </div>
      </div>
      {editing && (
        <div className="mt-4 rounded-lg border border-surface-border p-3">
          <BatteryReadingForm vehicleId={vehicleId} reading={reading} onDone={() => setEditing(false)} />
        </div>
      )}
    </li>
  )
}
