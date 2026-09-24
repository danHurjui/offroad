import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { requireSessionOrRedirect } from '@/lib/serverAuth'
import { requireVehicleAccess, hidesCosts } from '@/lib/access'
import { getVocabulary } from '@/lib/vocabulary'
import { isDateRange, type DateRange } from '@/lib/analytics'
import { ownershipReport, type CostCategory, type CostLine, type Message } from '@/lib/ownershipCosts'
import { loadOwnershipInputs } from '@/lib/ownershipRecords'
import { vehicleHasPro } from '@/lib/entitlement'

const RANGES: DateRange[] = ['3m', '12m', 'all']
const money = (n: number) => n.toLocaleString('ro-RO', { maximumFractionDigits: 2 })
const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })
const DATE_VALUES = new Set(['date', 'from', 'to'])

/** Where to record each kind of cost, for the "nothing recorded" list. */
function addHref(vehicleId: string, category: CostCategory, isOwner: boolean): string | null {
  const base = `/dashboard/vehicles/${vehicleId}`
  switch (category) {
    case 'purchase':
    case 'finance':
      return isOwner ? `${base}/edit#values` : null
    case 'fuel':
      return `${base}/fuel`
    case 'work':
      return `${base}/tasks/new`
    case 'insurance':
    case 'inspection':
      return isOwner ? `${base}/documents` : null
    case 'roadCharges':
    case 'other':
      return `${base}/expenses`
    case 'tyres':
      return `${base}/tyres`
  }
}

// RL-045: the true cost of ownership — every source added up, each figure
// clicking through to the entries behind it, and a plain list of what the
// total does not know. Free: the total and its gaps. Pro: the breakdown,
// the entries, cost per km and the period filter.
export default async function OwnershipCostsPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { range?: string }
}) {
  const t = await getTranslations('ownership')
  const tc = await getTranslations('common')
  const th = await getTranslations('health')
  const tt = await getTranslations('tyres')
  const te = await getTranslations('expenses')
  const session = await requireSessionOrRedirect()
  const vehicle = await requireVehicleAccess(params.id, session.user.id)
  if (!vehicle) notFound()
  const config = await getVocabulary(vehicle.projectType)
  const isOwner = vehicle.access === 'owner'

  const back = (
    <Link href={`/dashboard/vehicles/${vehicle.id}`} className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
      {tc('backTo', { screen: config.screenTitle })}
    </Link>
  )

  // A new aggregate, so RL-031's switch is applied here rather than
  // assumed from the routes: a collaborator it hides costs from sees none.
  if (hidesCosts(vehicle)) {
    return (
      <div className="mx-auto max-w-2xl">
        {back}
        <h1 className="mb-6 text-2xl font-bold text-ink">{t('title')}</h1>
        <div className="card p-4 text-sm text-ink-muted">{t('hiddenFromCollaborators')}</div>
      </div>
    )
  }

  // Pro is the owner's subscription, as on the analytics page.
  const isPro = await vehicleHasPro(vehicle)
  const range: DateRange = isPro && isDateRange(searchParams.range) ? searchParams.range : 'all'

  // The same loader as the fleet cost page (RL-039), so the two add up
  // the same rows.
  const now = new Date()
  const inputs = await loadOwnershipInputs([vehicle], now)
  const report = ownershipReport(inputs.get(vehicle.id)!, range)

  const say = (m: Message) => {
    const values: Record<string, string | number> = { ...(m.values ?? {}) }
    for (const [k, v] of Object.entries(values)) {
      if (DATE_VALUES.has(k) && typeof v === 'string') values[k] = fmtDate(new Date(`${v}T00:00:00Z`))
    }
    return t(m.key, values)
  }
  const lineLabel = (line: CostLine) => {
    const [ns, code] = line.labelKey.split('.')
    if (ns === 'doc') return th(`doc.${code}`)
    if (ns === 'season') return tt(`season.${code}`)
    if (ns === 'kind') return te(`kind.${code}`)
    return t(line.labelKey)
  }
  const recorded = report.categories.filter((c) => c.count > 0)
  const missing = report.categories.filter((c) => c.count === 0)
  const value = report.value

  return (
    <div className="mx-auto max-w-2xl">
      {back}
      <h1 className="mb-1 text-2xl font-bold text-ink">{t('title')}</h1>
      <p className="mb-6 text-sm text-ink-muted">{t('period', { from: fmtDate(report.from) })}</p>

      {isPro && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/dashboard/vehicles/${vehicle.id}/costs?range=${r}`}
              aria-current={range === r ? 'page' : undefined}
              className={`badge ${range === r ? 'bg-brand-500 text-white' : 'bg-surface-subtle text-ink-muted'}`}
            >
              {t(`range.${r}`)}
            </Link>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card p-4">
          <div className="text-xs text-ink-faint">{t('total')}</div>
          <div className="text-2xl font-semibold text-ink">{money(report.total)} RON</div>
          {report.total !== report.runningTotal && (
            <div className="text-sm text-ink-muted">{t('runningTotal', { amount: money(report.runningTotal) })}</div>
          )}
        </div>
        {isPro ? (
          <div className="card p-4">
            <div className="text-xs text-ink-faint">{t('perKmTitle')}</div>
            {report.perKm ? (
              <>
                <div className="text-2xl font-semibold text-ink">{t('perKmValue', { value: report.perKm.value.toLocaleString('ro-RO', { maximumFractionDigits: 2, minimumFractionDigits: 2 }) })}</div>
                <div className="text-sm text-ink-muted">
                  {t('perKmDetail', {
                    costs: money(report.perKm.costs),
                    km: report.perKm.km.toLocaleString('ro-RO'),
                    from: fmtDate(report.perKm.from),
                    to: fmtDate(report.perKm.to),
                  })}
                </div>
              </>
            ) : (
              <div className="text-sm text-ink-muted">{report.perKmMissing && say(report.perKmMissing)}</div>
            )}
          </div>
        ) : (
          <div className="card note p-4 text-sm text-ink">{t('upgradePrompt')}</div>
        )}
      </div>

      <section className="card note-warn mb-6 p-4 text-sm" aria-labelledby="coverage-title">
        <h2 id="coverage-title" className="mb-2 font-semibold text-ink">{t('coverageTitle')}</h2>
        <ul className="list-disc space-y-1 pl-5 text-ink">
          {report.coverage.map((m) => (
            <li key={m.key}>{say(m)}</li>
          ))}
          <li>{t('depreciation')}</li>
        </ul>
      </section>

      <section className="card mb-6 p-4" aria-labelledby="value-title">
        <h2 id="value-title" className="font-semibold text-ink">{t('value.title')}</h2>
        {value ? (
          <>
            <p className="text-lg font-semibold text-ink">{money(value.currentValueRon)} RON</p>
            <p className="text-sm text-ink-muted">
              {value.at ? t('value.asOf', { date: fmtDate(value.at) }) : t('value.yours')}
              {value.purchasePriceRon != null &&
                value.purchasePriceRon !== value.currentValueRon &&
                ` · ${t(value.currentValueRon < value.purchasePriceRon ? 'value.below' : 'value.above', {
                  amount: money(Math.abs(value.purchasePriceRon - value.currentValueRon)),
                })}`}
            </p>
          </>
        ) : (
          <p className="text-sm text-ink-muted">{t('value.none')}</p>
        )}
        {isOwner && (
          <Link href={`/dashboard/vehicles/${vehicle.id}/edit#values`} className="mt-1 inline-block text-sm text-brand-600 hover:underline dark:text-brand-300">
            {t('value.edit')}
          </Link>
        )}
      </section>

      {isPro && (
        <section aria-labelledby="breakdown-title">
          <h2 id="breakdown-title" className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{t('breakdown')}</h2>
          {recorded.length === 0 ? (
            <p className="card p-6 text-center text-ink-muted">{t('empty')}</p>
          ) : (
            <div className="card divide-y divide-surface-border">
              {recorded.map((c) => (
                <details key={c.category} className="group p-4">
                  <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{t(`category.${c.category}`)}</span>
                    <span className="text-ink">
                      {money(c.total)} RON <span className="text-sm text-ink-muted">· {t('entries', { count: c.count })}</span>
                    </span>
                  </summary>
                  <ul className="mt-3 space-y-1 text-sm">
                    {report.lines
                      .filter((l) => l.category === c.category)
                      .map((l) => (
                        <li key={`${l.source}:${l.id}`} className="flex flex-wrap justify-between gap-x-3">
                          <Link href={l.href} className="min-w-0 text-brand-600 hover:underline dark:text-brand-300">
                            {fmtDate(l.date)} · {lineLabel(l)}
                            {l.text ? ` · ${l.text}` : ''}
                          </Link>
                          <span className="text-ink">{money(l.amount)} RON</span>
                        </li>
                      ))}
                  </ul>
                </details>
              ))}
            </div>
          )}
          {missing.length > 0 && (
            <p className="mt-3 text-sm text-ink-muted">
              {t('nothingRecorded')}{' '}
              {missing.map((c, i) => {
                const href = addHref(vehicle.id, c.category, isOwner)
                return (
                  <span key={c.category}>
                    {i > 0 && ', '}
                    {href ? (
                      <Link href={href} className="text-brand-600 hover:underline dark:text-brand-300">
                        {t(`category.${c.category}`)}
                      </Link>
                    ) : (
                      t(`category.${c.category}`)
                    )}
                  </span>
                )
              })}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
