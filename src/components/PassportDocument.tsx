import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getVocabulary } from '@/lib/vocabulary'
import { labelFor, type ProjectType } from '@/lib/projectType'
import type { Message } from '@/lib/passport'
import type { PassportView } from '@/lib/passportRecords'
import { formatRon } from '@/lib/money'

const fmtDate = (d: Date) => d.toLocaleDateString('ro-RO', { timeZone: 'UTC' })
const km = (n: number) => `${n.toLocaleString('ro-RO')} km`
const money = (n: number) => formatRon(n)
const STATUS_CLASS = { valid: 'badge-success', expiring: 'badge-warn', expired: 'badge-danger' } as const

/**
 * RL-049: one passport, rendered. Used by the owner's preview and by the
 * shared link, so what the owner checks is exactly what a buyer reads.
 * What it is goes in the heading, not a footnote.
 */
export default async function PassportDocument({
  view,
  projectType,
  asOf,
}: {
  view: PassportView
  projectType: ProjectType
  asOf: Date
}) {
  const t = await getTranslations('passport')
  const th = await getTranslations('health')
  const tt = await getTranslations('tyres')
  const ta = await getTranslations('accidents')
  const tb = await getTranslations('battery')
  const config = await getVocabulary(projectType)
  const { passport: p, photos, publicUrl } = view
  const say = (m: Message) => t(m.key, m.values ?? {})
  // Every section carries it, so a screenshot of one section still says
  // whose account it is.
  const ownerTag = <span className="badge badge-warn ml-2 align-middle normal-case tracking-normal">{t('ownerView')}</span>

  return (
    <article className="space-y-6">
      <header className="card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">{t('title')}</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">{p.name}</h1>
        <div className="note-warn mt-3 rounded-lg border p-3 text-sm text-ink">
          <p className="font-semibold">{t('ownerView')}</p>
          <p className="mt-1">{t('what')}</p>
          <p className="mt-1">{t('ownerViewAdvice')}</p>
        </div>
        {(p.plate || p.vin) && (
          <p className="mt-3 text-sm text-ink-muted">
            {p.plate && <span className="plate mr-2">{p.plate}</span>}
            {p.vin && <span className="font-mono">VIN {p.vin}</span>}
          </p>
        )}
        <p className="mt-3 text-xs text-ink-faint">{t('asOf', { date: fmtDate(asOf) })}</p>
      </header>

      <section aria-labelledby="passport-summary">
        <h2 id="passport-summary" className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t('summary')}
          {ownerTag}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="card p-4">
            <div className="text-xs text-ink-faint">{t(p.span.fromPurchase ? 'ownedSince' : 'recordsSince')}</div>
            <div className="text-lg font-semibold text-ink">{fmtDate(p.span.from)}</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-faint">{t('latestKm')}</div>
            <div className="text-lg font-semibold text-ink">{p.mileage.latest ? km(p.mileage.latest.km) : t('none')}</div>
            {p.mileage.latest && <div className="text-xs text-ink-muted">{t('readOn', { date: fmtDate(p.mileage.latest.date) })}</div>}
          </div>
          <div className="card p-4">
            <div className="text-xs text-ink-faint">{t('jobs')}</div>
            <div className="text-lg font-semibold text-ink">{p.jobs.count}</div>
            {p.jobs.spend !== null && p.jobs.count > 0 && <div className="text-xs text-ink-muted">{t('spend', { amount: money(p.jobs.spend) })}</div>}
          </div>
        </div>
      </section>

      <section className="card note-warn p-4 text-sm" aria-labelledby="passport-missing">
        <h2 id="passport-missing" className="mb-2 font-semibold text-ink">
          {t('missingTitle')}
          {ownerTag}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-ink">
          {p.gaps.map((g) => (
            <li key={g.from.toISOString()}>{t('gap', { from: fmtDate(g.from), to: fmtDate(g.to), days: g.days })}</li>
          ))}
          {p.absences.map((m) => (
            <li key={m.key}>{say(m)}</li>
          ))}
          {p.mileage.resets > 0 && <li>{t('resets', { count: p.mileage.resets })}</li>}
        </ul>
      </section>

      <section aria-labelledby="passport-jobs">
        <h2 id="passport-jobs" className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t('historyTitle')}
          {ownerTag}
        </h2>
        <p className="mb-2 text-xs text-ink-faint">{t('datesRule')}</p>
        {p.jobs.rows.length === 0 ? (
          <p className="card p-6 text-center text-ink-muted">{t('absence.noJobs')}</p>
        ) : (
          <ol className="card divide-y divide-surface-border">
            {p.jobs.rows.map((row) => (
              <li key={row.taskId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 p-4">
                <div className="min-w-0 flex-1 basis-56">
                  <div className="text-sm text-ink-muted">
                    {fmtDate(row.date)}
                    {row.km !== null && ` · ${km(row.km)}`}
                  </div>
                  <div className="font-semibold text-ink">{row.name}</div>
                  <div className="text-sm text-ink-muted">
                    {[labelFor(config.categories, row.category), row.parts, row.workType === 'WORKSHOP' ? row.workshop ?? t('workshop') : t('diy')]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div className="mt-1 text-xs text-ink-faint">
                    {t('recordedOn', { date: fmtDate(row.recordedAt) })}
                    {row.changedAt && ` · ${t('changedOn', { date: fmtDate(row.changedAt) })}`}
                    {row.flags.some((f) => f.kind === 'odometerReset') && ` · ${t('kmRestarts')}`}
                  </div>
                </div>
                {p.jobs.spend !== null && row.cost > 0 && <div className="shrink-0 text-ink">{money(row.cost)}</div>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="card p-4" aria-labelledby="passport-docs">
          <h2 id="passport-docs" className="mb-2 font-semibold text-ink">
            {t('documentsTitle')}
            {ownerTag}
          </h2>
          {p.documents.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('absence.noDocuments')}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {p.documents.map((d) => (
                <li key={`${d.type}-${d.expiryDate.toISOString()}`} className="flex flex-wrap items-center gap-2">
                  <span className="text-ink">{th(`doc.${d.type}`)}</span>
                  <span className={`badge ${STATUS_CLASS[d.status]}`}>{t(`docStatus.${d.status}`, { date: fmtDate(d.expiryDate) })}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-faint">{t('documentsNote')}</p>
        </div>
        {projectType !== 'RESTORATION' && (
          <div className="card p-4" aria-labelledby="passport-tyres">
            <h2 id="passport-tyres" className="mb-2 font-semibold text-ink">
              {t('tyresTitle')}
              {ownerTag}
            </h2>
            {p.tyres.count === 0 ? (
              <p className="text-sm text-ink-muted">{t('absence.noTyres')}</p>
            ) : (
              <p className="text-sm text-ink">
                {t('tyreSets', { count: p.tyres.count })}
                {p.tyres.fitted &&
                  ` · ${t('fitted', {
                    season: tt(`season.${p.tyres.fitted.season}`),
                    label: p.tyres.fitted.label ?? '',
                    dot: p.tyres.fitted.dotYear ?? '',
                  })}`}
              </p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="passport-accidents">
        <h2 id="passport-accidents" className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          {t('accidentsTitle')}
          {ownerTag}
        </h2>
        <p className="mb-2 text-xs text-ink-faint">{t('accidentsNote')}</p>
        {p.accidents.length === 0 ? (
          <p className="card p-6 text-center text-ink-muted">{t('absence.noAccidentsRecorded')}</p>
        ) : (
          <ol className="card divide-y divide-surface-border">
            {p.accidents.map((a, i) => (
              <li key={`${a.date.toISOString()}-${i}`} className="space-y-1 p-4">
                <div className="text-sm text-ink-muted">
                  {fmtDate(a.date)}
                  {a.km !== null && ` · ${km(a.km)}`}
                </div>
                <div className="font-semibold text-ink">{ta(`kind.${a.kind}`)}</div>
                <p className="whitespace-pre-line text-sm text-ink">{a.description}</p>
                <div className="text-sm text-ink-muted">
                  {[
                    a.insurance && t(`accidentInsurance.${a.insurance}`),
                    a.repairedAt ? t('accidentRepaired', { date: fmtDate(a.repairedAt) }) : t('accidentNotRepaired'),
                    a.repairCost !== null && t('accidentCost', { amount: money(a.repairCost) }),
                    a.photoCount > 0 && t('accidentPhotos', { count: a.photoCount }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                <div className="text-xs text-ink-faint">
                  {t('recordedOn', { date: fmtDate(a.recordedAt) })}
                  {a.changedAt && ` · ${t('changedOn', { date: fmtDate(a.changedAt) })}`}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {p.battery.shown && (
        <section aria-labelledby="passport-battery">
          <h2 id="passport-battery" className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {t('batteryTitle')}
            {ownerTag}
          </h2>
          <p className="mb-2 text-xs text-ink-faint">{t('batteryNote')}</p>
          {p.battery.readings.length === 0 ? (
            <p className="card p-6 text-center text-ink-muted">{t('absence.noBatteryReadingsRecorded')}</p>
          ) : (
            <ol className="card divide-y divide-surface-border">
              {p.battery.readings.map((r, i) => (
                <li key={`${r.date.toISOString()}-${i}`} className="space-y-1 p-4">
                  <div className="text-sm text-ink-muted">
                    {fmtDate(r.date)}
                    {r.km !== null && ` · ${km(r.km)}`}
                  </div>
                  <div className="font-semibold text-ink">
                    {t('batteryReading', { soh: r.sohPercent, source: tb(`source.${r.source}`) })}
                  </div>
                  {r.note && <p className="whitespace-pre-line text-sm text-ink">{r.note}</p>}
                  <div className="text-xs text-ink-faint">{t('recordedOn', { date: fmtDate(r.recordedAt) })}</div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {photos.length > 0 && (
        <section aria-labelledby="passport-photos">
          <h2 id="passport-photos" className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
            {t('photosTitle')}
            {ownerTag}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((photo) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={photo.url} src={`/api/uploads/${photo.url}`} alt={photo.caption ?? ''} className="aspect-square w-full rounded-lg object-cover" loading="lazy" />
            ))}
          </div>
        </section>
      )}
      {publicUrl && (
        <p className="text-sm">
          <Link href={publicUrl} className="text-brand-600 hover:underline dark:text-brand-300">
            {t('buildPage')}
          </Link>
        </p>
      )}

      <footer className="border-t border-surface-border pt-4 text-xs text-ink-faint">{t('footer')}</footer>
    </article>
  )
}
