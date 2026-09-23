'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/** RL-044: a reading's remove button — undo instead of confirm, like every removal since RL-034. */
export function RemoveReadingButton({ vehicleId, readingId, km }: { vehicleId: string; readingId: string; km: number }) {
  const t = useTranslations('odometer')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  const kmLabel = km.toLocaleString('ro-RO')
  return (
    <button
      type="button"
      className="text-sm text-red-600 hover:underline dark:text-red-400"
      onClick={() =>
        toast.undoable({
          key: `odometer:${readingId}`,
          message: t('deleted', { km: kmLabel }),
          request: { url: `/api/vehicles/${vehicleId}/odometer/${readingId}`, method: 'DELETE' },
          onCommitted: () => router.refresh(),
          onFailed: async (res) => toast.error(await reasonFor(res, t('deleteFailed'))),
        })
      }
    >
      {t('remove')}
    </button>
  )
}

export function ReadingRow({ readingId, children }: { readingId: string; children: React.ReactNode }) {
  return <HideWhilePending pendingKey={`odometer:${readingId}`}>{children}</HideWhilePending>
}
