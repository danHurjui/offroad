import { getTranslations } from 'next-intl/server'
import { labelFor, statusBadgeClass } from '@/lib/projectType'
import { getVocabulary } from '@/lib/vocabulary'

/**
 * The mock screens on the tour.
 *
 * Every one of these is invented data drawn in the app's own components
 * and tokens — `.card`, `.badge`, `badge-success`, `text-ink-muted` — so
 * a theme change or a palette change moves the tour with it, and a
 * preview cannot show a look the app no longer has. `DemoScreen` labels
 * them as samples; see the note there about why that matters.
 *
 * Where a preview shows vocabulary (a category, a status, a photo type)
 * it looks it up through `getVocabulary()` rather than writing the words
 * in, so what is on screen is genuinely what that mode has. Only the
 * *rows* are made up.
 *
 * A mode had to be picked for those lookups and it is off-road, because
 * the tour's own mode switcher already shows the other two.
 */

const SAMPLE_MODE = 'OFFROAD' as const

/** A cost, in the app's own format. */
function ron(amount: number): string {
  return `${amount.toLocaleString('ro-RO')} RON`
}

/**
 * The jobs list: what the app is, in one picture.
 *
 * Each row carries the four things a task row carries for real — name,
 * category, status, and what it cost — because the costs being attached
 * to the work rather than kept in a separate ledger is the part people
 * ask about.
 */
export async function TasksPreview() {
  const t = await getTranslations('demo')
  const config = await getVocabulary(SAMPLE_MODE)

  const rows = [
    { key: 'lift', category: 'SUSPENSION', status: 'DONE', cost: 4850 },
    { key: 'winch', category: 'RECOVERY', status: 'IN_PROGRESS', cost: 3200 },
    { key: 'bar', category: 'LIGHTING', status: 'SOURCED', cost: 890 },
    { key: 'diff', category: 'ENGINE', status: 'PLANNED', cost: null },
  ]

  return (
    <ul className="divide-y divide-surface-border">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-ink">{t(`sample.task.${row.key}`)}</div>
            <div className="text-xs text-ink-faint">{labelFor(config.categories, row.category)}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm tabular-nums text-ink-muted">
              {row.cost === null ? '—' : ron(row.cost)}
            </span>
            <span className={statusBadgeClass(config.statusTags, row.status)}>
              {labelFor(config.statusTags, row.status)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * The photo timeline. Boxes rather than photographs: shipping stock
 * images of somebody else's Land Cruiser to stand in for the reader's
 * would be a picture of a product this is not.
 */
export async function PhotosPreview() {
  const t = await getTranslations('demo')
  const config = await getVocabulary(SAMPLE_MODE)
  const types = ['BEFORE', 'INSTALL', 'AFTER', 'TRAIL']

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {types.map((type) => (
          <div key={type} className="overflow-hidden rounded-lg border border-surface-border">
            <div
              aria-hidden="true"
              className="flex h-20 items-center justify-center bg-surface-subtle text-ink-faint"
            >
              {/* A camera glyph, drawn rather than an emoji so it inherits
                  the ink colour in both themes. */}
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-9Z" />
                <circle cx="12" cy="13" r="3.25" />
              </svg>
            </div>
            <div className="px-2 py-1.5 text-center text-xs text-ink-muted">
              {labelFor(config.photoTypes, type)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-muted">{t('sample.photosNote')}</p>
    </div>
  )
}

/**
 * Documents and their expiry.
 *
 * The three rows are deliberately at 45, 12 and 3 days, which is one row
 * either side of each reminder threshold and one sitting on the last of
 * them — the thing being demonstrated is that the app writes first and
 * the windscreen sticker second.
 */
export async function DocumentsPreview() {
  const t = await getTranslations('demo')

  const rows = [
    { key: 'itp', days: 45, tone: 'badge-success' },
    { key: 'rca', days: 12, tone: 'badge-warn' },
    { key: 'rovinieta', days: 3, tone: 'badge-danger' },
  ]

  return (
    <div>
      <ul className="divide-y divide-surface-border">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="text-sm font-medium text-ink">{t(`sample.document.${row.key}`)}</span>
            <span className={`badge ${row.tone}`}>{t('sample.expiresIn', { days: row.days })}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">{t('sample.documentsNote')}</p>
    </div>
  )
}

/**
 * Cost analytics.
 *
 * One measure — money — split by category, so it is a single-series bar
 * chart in one hue rather than a categorical palette: the categories are
 * identified by the label beside each bar, and painting each a different
 * colour would encode nothing that the text does not already say. Every
 * value is written out, so the bars carry no information that is lost to
 * a colourblind or monochrome reader; the widths are there to make the
 * shape of the spend readable at a glance.
 */
export async function AnalyticsPreview() {
  const t = await getTranslations('demo')
  const config = await getVocabulary(SAMPLE_MODE)

  const bars = [
    { category: 'SUSPENSION', amount: 8420 },
    { category: 'RECOVERY', amount: 5100 },
    { category: 'TYRES', amount: 4300 },
    { category: 'LIGHTING', amount: 1890 },
    { category: 'MAINTENANCE', amount: 1260 },
  ]
  const max = Math.max(...bars.map((b) => b.amount))
  const total = bars.reduce((sum, b) => sum + b.amount, 0)

  const tiles = [
    { key: 'total', value: ron(total) },
    { key: 'jobs', value: '34' },
    { key: 'perMonth', value: ron(1_745) },
  ]

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div key={tile.key} className="rounded-lg bg-surface-muted p-3">
            <div className="text-xs text-ink-faint">{t(`sample.stat.${tile.key}`)}</div>
            <div className="mt-0.5 text-base font-semibold tabular-nums text-ink">{tile.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2.5">
        {bars.map((bar) => (
          <div key={bar.category}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-ink-muted">{labelFor(config.categories, bar.category)}</span>
              <span className="tabular-nums text-ink-faint">{ron(bar.amount)}</span>
            </div>
            {/* The track is the recessive part; the bar is 8px with a
                rounded data end, anchored at the baseline. */}
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
              <div
                className="h-full rounded-r-full bg-brand-500 dark:bg-brand-400"
                style={{ width: `${Math.round((bar.amount / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * A recorded trail run.
 *
 * The polyline is drawn the same way TrailThumbnail draws a real one —
 * normalised into a 100×100 box, stroked with a Tailwind class so it
 * stays visible on a dark card — over an invented track.
 */
export async function TrailPreview() {
  const t = await getTranslations('demo')

  const track = '10,78 22,70 28,52 40,58 47,40 58,44 66,28 78,33 88,18'
  const stats = [
    { key: 'distance', value: '14.2 km' },
    { key: 'duration', value: '2h 05m' },
    { key: 'waypoints', value: '6' },
  ]

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label={t('sample.trackAlt')}
        className="h-32 w-full rounded-lg border border-surface-border bg-surface-subtle sm:w-40"
        preserveAspectRatio="none"
      >
        <polyline
          points={track}
          fill="none"
          className="stroke-brand-500 dark:stroke-brand-300"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Waypoints — the note-and-photo pins dropped while recording. */}
        {['28,52', '58,44', '88,18'].map((point) => {
          const [cx, cy] = point.split(',')
          return <circle key={point} cx={cx} cy={cy} r={3} className="fill-brand-600 dark:fill-brand-200" />
        })}
      </svg>
      <div className="flex-1">
        <div className="text-sm font-medium text-ink">{t('sample.trailName')}</div>
        <dl className="mt-2 grid grid-cols-3 gap-2">
          {stats.map((stat) => (
            <div key={stat.key}>
              <dt className="text-xs text-ink-faint">{t(`sample.trail.${stat.key}`)}</dt>
              <dd className="text-sm font-semibold tabular-nums text-ink">{stat.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

/**
 * The public build page — the read-only profile at
 * /builds/<username>/<slug> that needs no account to read.
 */
export async function PublicBuildPreview() {
  const t = await getTranslations('demo')
  const config = await getVocabulary(SAMPLE_MODE)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-brand">{config.label}</span>
        <span className="badge badge-neutral">{t('sample.buildPublic')}</span>
      </div>
      <h3 className="mt-2 text-lg font-semibold text-ink">{t('sample.buildName')}</h3>
      <p className="text-xs text-ink-faint">{t('sample.buildOwner')}</p>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-ink-muted">{config.progressLabel}</span>
        <span className="font-semibold text-ink">62%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
        <div className="h-full rounded-full bg-brand-500" style={{ width: '62%' }} />
      </div>
      <p className="mt-3 text-xs text-ink-muted">{t('sample.buildNote')}</p>
    </div>
  )
}

/**
 * The shareable PNG card, as the image generator lays it out — cover
 * area, vehicle name, a few headline numbers, wordmark.
 */
export async function CardPreview() {
  const t = await getTranslations('demo')

  return (
    <div className="overflow-hidden rounded-lg border border-surface-border">
      <div aria-hidden="true" className="h-20 bg-gradient-to-br from-brand-500 to-brand-700" />
      <div className="bg-surface-muted p-4">
        <div className="text-sm font-semibold text-ink">{t('sample.buildName')}</div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[
            { key: 'mods', value: '34' },
            { key: 'spent', value: ron(21_970) },
            { key: 'progress', value: '62%' },
          ].map((stat) => (
            <div key={stat.key} className="rounded-lg bg-surface p-2">
              <div className="text-sm font-semibold tabular-nums text-ink">{stat.value}</div>
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">
                {t(`sample.card.${stat.key}`)}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-right text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
          RigLog
        </div>
      </div>
    </div>
  )
}

/**
 * A mechanic on the vehicle, and the toggle that decides whether they can
 * see what it all cost.
 */
export async function CollaboratorsPreview() {
  const t = await getTranslations('demo')

  const people = [
    { key: 'owner', badge: 'badge-brand' },
    { key: 'mechanic', badge: 'badge-success' },
    { key: 'invited', badge: 'badge-warn' },
  ]

  return (
    <div>
      <ul className="divide-y divide-surface-border">
        {people.map((person) => (
          <li key={person.key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div>
              <div className="text-sm font-medium text-ink">{t(`sample.person.${person.key}.name`)}</div>
              <div className="text-xs text-ink-faint">{t(`sample.person.${person.key}.email`)}</div>
            </div>
            <span className={`badge ${person.badge}`}>{t(`sample.person.${person.key}.role`)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-surface-border bg-surface-muted p-3">
        <span aria-hidden="true" className="mt-0.5 h-4 w-7 shrink-0 rounded-full bg-brand-500">
          <span className="ml-3.5 block h-4 w-3.5 rounded-full border-2 border-brand-500 bg-surface" />
        </span>
        <span className="text-xs text-ink-muted">{t('sample.hideCosts')}</span>
      </div>
    </div>
  )
}
