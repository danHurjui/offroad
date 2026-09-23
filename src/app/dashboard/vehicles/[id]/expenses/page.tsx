import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { prisma } from '@/lib/prisma'
import { getVocabulary } from '@/lib/vocabulary'
import { toNumberOrNull } from '@/lib/serialize'
import ExpenseQuickAdd from '@/components/ExpenseQuickAdd'
import { ExpenseRow, RemoveExpenseButton } from '@/components/ExpenseRemove'

const num = (n: number) => n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })
const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })

// RL-045: the running costs that are not a job, a fill-up, a document or a
// set of tyres. The cost of ownership screen adds them up with the rest.
export default async function ExpensesPage({ params }: { params: { id: string } }) {
  const t = await getTranslations('expenses')
  const tc = await getTranslations('common')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)
  const isOwner = vehicle.access === 'owner'
  const hideSpend = hidesCosts(vehicle)

  const rows = await prisma.vehicleExpense.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  })
  const expenses = rows.map((r) => ({ ...r, amountRon: toNumberOrNull(r.amountRon) ?? 0 }))
  const total = expenses.reduce((s, e) => s + e.amountRon, 0)

  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
        {tc('backTo', { screen: config.screenTitle })}
      </Link>
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('pageTitle')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('subtitle')}</p>

      <div className="card mb-6 p-4">
        <ExpenseQuickAdd vehicleId={vehicle.id} />
      </div>

      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('history')}</h2>
        {!hideSpend && expenses.length > 0 && <span className="text-sm text-ink-muted">{t('total', { total: num(total) })}</span>}
      </div>
      {expenses.length === 0 ? (
        <p className="card p-6 text-center text-ink-muted">{t('empty')}</p>
      ) : (
        <ul className="card divide-y divide-surface-border">
          {expenses.map((e) => (
            <ExpenseRow key={e.id} expenseId={e.id}>
              <li className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{num(e.amountRon)} RON</span>
                    <span className="badge badge-neutral">{t(`kind.${e.kind}`)}</span>
                  </div>
                  <div className="text-sm text-ink-muted">
                    {fmtDate(e.date)}
                    {e.note && ` · ${e.note}`}
                  </div>
                </div>
                {(isOwner || e.createdByUserId === session.user.id) && (
                  <RemoveExpenseButton vehicleId={vehicle.id} expenseId={e.id} label={`${t(`kind.${e.kind}`)} ${fmtDate(e.date)}`} />
                )}
              </li>
            </ExpenseRow>
          ))}
        </ul>
      )}
    </div>
  )
}
