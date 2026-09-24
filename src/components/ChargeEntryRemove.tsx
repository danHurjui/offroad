'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'
import ChargeQuickAdd, { type EditableCharge } from './ChargeQuickAdd'

/** RL-053: remove a charge with Undo rather than a confirm (RL-034). */
export function RemoveChargeButton({ vehicleId, entryId, dateLabel }: { vehicleId: string; entryId: string; dateLabel: string }) {
  const t = useTranslations('charging')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  return (
    <button
      type="button"
      className="text-sm text-red-600 hover:underline dark:text-red-400"
      onClick={() =>
        toast.undoable({
          key: `charge:${entryId}`,
          message: t('deleted', { date: dateLabel }),
          request: { url: `/api/vehicles/${vehicleId}/charges/${entryId}`, method: 'DELETE' },
          onCommitted: () => router.refresh(),
          onFailed: async (res) => toast.error(await reasonFor(res, t('deleteFailed'))),
        })
      }
    >
      {t('remove')}
    </button>
  )
}

export function ChargeRow({ entryId, children }: { entryId: string; children: React.ReactNode }) {
  return <HideWhilePending pendingKey={`charge:${entryId}`}>{children}</HideWhilePending>
}

/**
 * One charge in the list: what was recorded, and — for the owner or the
 * person who logged it — Edit (the add form, correcting this charge in
 * place) and Remove (with Undo).
 */
export function ChargeItem({
  vehicleId,
  entry,
  dateLabel,
  receiptUrl,
  canChange,
  hasHomeTariff,
  hideCosts,
  children,
}: {
  vehicleId: string
  entry: EditableCharge
  dateLabel: string
  receiptUrl: string | null
  canChange: boolean
  hasHomeTariff: boolean
  hideCosts: boolean
  children: React.ReactNode
}) {
  const t = useTranslations('charging')
  const [editing, setEditing] = useState(false)
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">{children}</div>
        <div className="flex shrink-0 items-center gap-3">
          {receiptUrl && (
            <a href={`/api/uploads/${receiptUrl}`} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline dark:text-brand-300">
              {t('viewReceipt')}
            </a>
          )}
          {canChange && !editing && (
            <button type="button" className="text-sm text-brand-600 hover:underline dark:text-brand-300" onClick={() => setEditing(true)}>
              {t('edit')}
            </button>
          )}
          {canChange && <RemoveChargeButton vehicleId={vehicleId} entryId={entry.id} dateLabel={dateLabel} />}
        </div>
      </div>
      {editing && (
        <div className="mt-4 rounded-lg border border-surface-border p-3">
          <ChargeQuickAdd
            vehicleId={vehicleId}
            hasHomeTariff={hasHomeTariff}
            entry={entry}
            hideCosts={hideCosts}
            onDone={() => setEditing(false)}
          />
        </div>
      )}
    </li>
  )
}
