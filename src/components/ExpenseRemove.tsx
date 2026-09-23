'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HideWhilePending, useToast } from './Toaster'
import { useFailureReason } from './useOptimisticWrite'

/** RL-045: remove a cost with Undo rather than a confirm (RL-034). */
export function RemoveExpenseButton({ vehicleId, expenseId, label }: { vehicleId: string; expenseId: string; label: string }) {
  const t = useTranslations('expenses')
  const router = useRouter()
  const toast = useToast()
  const reasonFor = useFailureReason()
  return (
    <button
      type="button"
      className="text-sm text-red-600 hover:underline dark:text-red-400"
      onClick={() =>
        toast.undoable({
          key: `expense:${expenseId}`,
          message: t('deleted', { label }),
          request: { url: `/api/vehicles/${vehicleId}/expenses/${expenseId}`, method: 'DELETE' },
          onCommitted: () => router.refresh(),
          onFailed: async (res) => toast.error(await reasonFor(res, t('deleteFailed'))),
        })
      }
    >
      {t('remove')}
    </button>
  )
}

export function ExpenseRow({ expenseId, children }: { expenseId: string; children: React.ReactNode }) {
  return <HideWhilePending pendingKey={`expense:${expenseId}`}>{children}</HideWhilePending>
}
