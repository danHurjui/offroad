'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/** RL-051: remove a trip (and its two km) with Undo rather than a confirm (RL-034). */
export function RemoveTripButton({ vehicleId, tripId, label }: { vehicleId: string; tripId: string; label: string }) {
  const t = useTranslations('trips')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  return (
    <button
      type="button"
      className="text-sm text-red-600 hover:underline dark:text-red-400"
      onClick={() =>
        toast.undoable({
          key: `trip:${tripId}`,
          message: t('deleted', { label }),
          request: { url: `/api/vehicles/${vehicleId}/trips/${tripId}`, method: 'DELETE' },
          onCommitted: () => router.refresh(),
          onFailed: async (res) => toast.error(await reasonFor(res, t('deleteFailed'))),
        })
      }
    >
      {t('remove')}
    </button>
  )
}

export function TripRow({ tripId, children }: { tripId: string; children: React.ReactNode }) {
  return <HideWhilePending pendingKey={`trip:${tripId}`}>{children}</HideWhilePending>
}
