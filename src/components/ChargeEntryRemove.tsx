'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

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
