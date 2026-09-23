'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/** RL-044: remove a fill-up with Undo rather than a confirm (RL-034). */
export function RemoveFuelButton({ vehicleId, entryId, dateLabel }: { vehicleId: string; entryId: string; dateLabel: string }) {
  const t = useTranslations('fuel')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  return (
    <button
      type="button"
      className="text-sm text-red-600 hover:underline dark:text-red-400"
      onClick={() =>
        toast.undoable({
          key: `fuel:${entryId}`,
          message: t('deleted', { date: dateLabel }),
          request: { url: `/api/vehicles/${vehicleId}/fuel/${entryId}`, method: 'DELETE' },
          onCommitted: () => router.refresh(),
          onFailed: async (res) => toast.error(await reasonFor(res, t('deleteFailed'))),
        })
      }
    >
      {t('remove')}
    </button>
  )
}

export function FuelRow({ entryId, children }: { entryId: string; children: React.ReactNode }) {
  return <HideWhilePending pendingKey={`fuel:${entryId}`}>{children}</HideWhilePending>
}
