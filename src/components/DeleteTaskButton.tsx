'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/**
 * RL-034: no confirm dialog. The task disappears and the owner lands back
 * on the vehicle, where a toast offers Undo for a few seconds; the DELETE
 * is only sent once that window closes (src/lib/writeFeedback.ts,
 * UndoQueue). The vehicle page hides the row meanwhile through
 * `HideWhilePending` keyed `task:<id>`.
 */
export default function DeleteTaskButton({
  vehicleId,
  taskId,
  taskName,
}: {
  vehicleId: string
  taskId: string
  taskName: string
}) {
  const t = useTranslations('task')
  const tc = useTranslations('common')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()

  function onDelete() {
    const vehicleUrl = `/dashboard/vehicles/${vehicleId}`
    toast.undoable({
      key: `task:${taskId}`,
      message: t('deleted', { name: taskName }),
      request: { url: `/api/vehicles/${vehicleId}/tasks/${taskId}`, method: 'DELETE' },
      onUndo: () => router.push(`${vehicleUrl}/tasks/${taskId}`),
      onCommitted: () => router.refresh(),
      onFailed: async (res) => {
        toast.error(await reasonFor(res, t('deleteFailed', { name: taskName })))
        router.refresh()
      },
    })
    router.push(vehicleUrl)
  }

  return (
    <button type="button" className="btn-danger" onClick={onDelete}>
      {tc('delete')}
    </button>
  )
}
