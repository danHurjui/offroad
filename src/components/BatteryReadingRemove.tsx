'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

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
