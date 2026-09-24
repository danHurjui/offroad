import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { HealthReport, HealthTone, Message } from '@/lib/vehicleHealth'

/**
 * RL-046: Car Health, rendered. Takes a report from computeHealth() so the
 * garage cards (RL-035) and the fleet board (RL-039) can reuse it rather
 * than re-deriving any of it.
 *
 * Colour is never the only signal: every row also says its state in
 * words, and the palette is the meaning-named badge tokens, so dark mode
 * comes with it (CLAUDE.md → Theme).
 */
const TONE_CLASS: Record<HealthTone, string> = {
  ok: 'badge-success',
  warn: 'badge-warn',
  danger: 'badge-danger',
  info: 'badge-info',
  none: 'badge-neutral',
}

export default async function VehicleHealthPanel({ report }: { report: HealthReport }) {
  const t = await getTranslations('health')
  const tb = await getTranslations('battery')
  // A document type named inside a message ("Renew the {type}") reads as
  // its short name, not the code.
  // Distances and depths are formatted the way the rest of the app writes
  // them (1.000 km, 2,4 mm); counts stay numbers, because the plural rules
  // in the messages need them to be.
  const say = (m: Message) => {
    const values: Record<string, string | number> = { ...(m.values ?? {}) }
    if (typeof values.type === 'string') values.type = t(`doc.${values.type}`)
    // RL-056: where a battery reading came from, named rather than coded.
    if (typeof values.source === 'string') values.source = tb(`source.${values.source}`)
    for (const key of ['km', 'mm', 'limitKm'] as const) {
      if (typeof values[key] === 'number') values[key] = (values[key] as number).toLocaleString('ro-RO')
    }
    return t(m.key, values)
  }

  return (
    <section className="card mb-6 p-4" aria-labelledby="health-title">
      <h2 id="health-title" className="font-semibold text-ink">{t('title')}</h2>
      <p className="mb-3 text-xs text-ink-faint">{t('subtitle')}</p>
      <ul className="divide-y divide-surface-border">
        {report.rows.map((row) => (
          // Name and verdict on one line, the reason under both at full
          // width. With the badge as a left column, a phone left the reason
          // about 160px to wrap in, four or five words a line.
          <li key={row.id} className="py-2.5">
            <div className="flex items-start justify-between gap-3">
              <Link href={row.href} className="min-w-0 font-medium text-ink hover:underline">
                {say(row.label)}
              </Link>
              <span className={`badge ${TONE_CLASS[row.tone]} mt-0.5 shrink-0`}>{t(`tone.${row.tone}`)}</span>
            </div>
            <p className="mt-0.5 text-sm text-ink-muted">{say(row.reason)}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-surface-border pt-3 text-sm">
        <span className="font-semibold text-ink">{t('next')}: </span>
        {report.next ? (
          <Link href={report.next.href} className="text-brand-600 hover:underline dark:text-brand-300">
            {say(report.next.message)}
          </Link>
        ) : (
          <span className="text-ink-muted">{t('nothingNext')}</span>
        )}
      </p>
    </section>
  )
}
