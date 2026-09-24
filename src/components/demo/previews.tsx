import { getTranslations } from 'next-intl/server'
import { LOCALES, LOCALE_NAMES } from '@/i18n/config'
import { labelFor, statusBadgeClass } from '@/lib/projectType'
import { SHORTCUTS, formatKeys } from '@/lib/shortcuts'
import { TICKET_STATUSES } from '@/lib/tickets'
import { decodeVin } from '@/lib/vinDecoder'
import { getAllVocabulary, getOriginalityConditions, getVocabulary } from '@/lib/vocabulary'
import { formatRon } from '@/lib/money'

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
  return formatRon(amount)
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

/**
 * One job's money, broken down the way the form takes it.
 *
 * The DIY hours line is the one people miss: the app records labour you
 * did yourself as time rather than folding it into a price, because a
 * Saturday is a real cost and putting a made-up hourly rate on it would
 * corrupt the totals.
 */
export async function CostsPreview() {
  const t = await getTranslations('demo')

  const lines = [
    { key: 'parts', value: ron(4_100) },
    { key: 'labour', value: ron(750) },
    { key: 'diyHours', value: t('sample.cost.hours', { hours: 6 }) },
  ]

  return (
    <div>
      <div className="text-sm font-medium text-ink">{t('sample.task.lift')}</div>
      <dl className="mt-3 divide-y divide-surface-border">
        {lines.map((line) => (
          <div key={line.key} className="flex items-center justify-between py-2 text-sm">
            <dt className="text-ink-muted">{t(`sample.cost.${line.key}`)}</dt>
            <dd className="tabular-nums text-ink">{line.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between pt-2 text-sm font-semibold">
          <dt className="text-ink">{t('sample.cost.total')}</dt>
          <dd className="tabular-nums text-ink">{ron(4_850)}</dd>
        </div>
      </dl>
    </div>
  )
}

/** The parts hunt, with the statuses that mode actually offers. */
export async function WishlistPreview() {
  const t = await getTranslations('demo')
  const config = await getVocabulary(SAMPLE_MODE)

  const rows = [
    { key: 'a', status: 'ORDERED', target: 2_400 },
    { key: 'b', status: 'SOURCED', target: 1_150 },
    { key: 'c', status: 'RESEARCHING', target: null },
  ]

  return (
    <ul className="divide-y divide-surface-border">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
          <span className="text-sm font-medium text-ink">{t(`sample.wishlist.${row.key}`)}</span>
          <span className="flex items-center gap-2">
            {row.target !== null && (
              <span className="text-xs tabular-nums text-ink-faint">
                {t('sample.targetPrice', { price: ron(row.target) })}
              </span>
            )}
            <span className="badge badge-neutral">{labelFor(config.wishlistStatuses, row.status)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The found state, which is three of the real columns (`frontNotes`,
 * `engineNotes`, `interiorNotes`) plus the condition rating. Shown as a
 * read-only record because that is what it becomes: it is written once,
 * at intake, and never edited afterwards.
 */
export async function FoundStatePreview() {
  const t = await getTranslations('demo')

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink">{t('sample.found.acquired')}</span>
        <span className="badge badge-warn">{t('sample.found.rating', { rating: 4 })}</span>
      </div>
      <dl className="mt-3 space-y-2.5">
        {['front', 'engine', 'interior'].map((part) => (
          <div key={part}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {t(`sample.found.${part}.label`)}
            </dt>
            <dd className="text-sm text-ink-muted">{t(`sample.found.${part}.note`)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * A PDF, as a page rather than a download button.
 *
 * Both export routes share this: the job report (free, one job) and the
 * build history (Pro, everything), told apart by `scope`. They are the
 * same engine and the same layout, so two different mock-ups would be
 * inventing a difference that isn't there.
 */
export async function PdfPreview({ scope }: { scope: 'job' | 'history' }) {
  const t = await getTranslations('demo')

  return (
    <div className="mx-auto max-w-xs rounded-lg border border-surface-border bg-surface p-4 shadow-card">
      <div className="border-b border-surface-border pb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">
          RigLog
        </div>
        <div className="text-sm font-semibold text-ink">{t(`sample.pdf.${scope}.title`)}</div>
        <div className="text-[11px] text-ink-faint">{t('sample.buildName')}</div>
      </div>
      {/* Ruled lines standing in for body text: the point is the shape of
          the document, and lorem ipsum in a preview reads as a mistake. */}
      <div aria-hidden="true" className="mt-3 space-y-1.5">
        {['w-full', 'w-11/12', 'w-4/5', 'w-full', 'w-3/5'].map((width, i) => (
          <div key={i} className={`h-1.5 rounded-full bg-surface-subtle ${width}`} />
        ))}
      </div>
      <div aria-hidden="true" className="mt-3 grid grid-cols-3 gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 rounded bg-surface-subtle" />
        ))}
      </div>
      <div className="mt-3 border-t border-surface-border pt-2 text-[11px] text-ink-faint">
        {t(`sample.pdf.${scope}.footer`)}
      </div>
    </div>
  )
}

/**
 * The originality score, over the real condition vocabulary.
 *
 * The score is OEM-original finished jobs over all finished jobs, so the
 * breakdown has to add up to the denominator — a preview whose numbers
 * don't reconcile teaches the reader the wrong thing about what the
 * number means.
 */
export async function OriginalityPreview() {
  const t = await getTranslations('demo')
  const conditions = await getOriginalityConditions()

  const counts: Record<string, number> = {
    OEM_ORIGINAL: 19,
    PERIOD_CORRECT: 6,
    MODERN_REPLACEMENT: 4,
    REPRODUCTION: 5,
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  const score = Math.round((counts.OEM_ORIGINAL / total) * 100)

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-4 border-brand-500 dark:border-brand-400">
          <span className="text-lg font-bold tabular-nums text-ink">{score}%</span>
        </div>
        <div className="text-sm text-ink-muted">{t('sample.originality.label')}</div>
      </div>
      <dl className="flex-1 space-y-1.5">
        {conditions.map((condition) => (
          <div key={condition.value} className="flex items-center justify-between text-sm">
            <dt className="text-ink-muted">{condition.label}</dt>
            <dd className="tabular-nums text-ink">{counts[condition.value]}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/**
 * The VIN decoder — and this one is not a mock at all.
 *
 * `decodeVin()` really runs, on an invented but well-formed UU1 chassis
 * number, which takes the local Dacia/Renault-Romania path and needs no
 * network. So the plant, the marque and the model-year arithmetic on
 * screen are the decoder's own output: if the table or the year-code
 * cycle changes, this preview changes with it rather than going quietly
 * out of date.
 *
 * The raw VIN is shown here because it is fictional. A real one never
 * reaches the public build page — only the decoded spec does.
 */
export async function VinPreview() {
  const t = await getTranslations('demo')
  const SAMPLE_VIN = 'UU1LSDAAHAH123456'
  const result = await decodeVin(SAMPLE_VIN)

  const fields: [string, string][] = [
    ['manufacturer', result?.decoded.manufacturer ?? '—'],
    ['year', result?.decoded.modelYear ? String(result.decoded.modelYear) : '—'],
    ['factory', result?.decoded.factory ?? '—'],
  ]

  return (
    <div>
      <div className="rounded-lg bg-surface-muted px-3 py-2 font-mono text-sm tracking-wider text-ink">
        {SAMPLE_VIN}
      </div>
      <dl className="mt-3 space-y-2">
        {fields.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between text-sm">
            <dt className="text-ink-muted">{t(`sample.vin.${key}`)}</dt>
            <dd className="font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-faint">
        {t('sample.vin.source', { source: result?.source ?? 'manual' })}
      </p>
    </div>
  )
}

/**
 * A price history against a target.
 *
 * Deliberately jagged and deliberately not monotonic: the prices are
 * whatever the owner happened to find, not a scraped series, and drawing
 * a tidy downward curve would suggest the app is watching shops on their
 * behalf. It isn't — see the chapter text.
 */
export async function PriceAlertPreview() {
  const t = await getTranslations('demo')

  const prices = [3_100, 2_950, 3_050, 2_700, 2_380]
  const target = 2_400
  const max = Math.max(...prices, target)
  const min = Math.min(...prices, target) * 0.92
  const y = (value: number) => 40 - ((value - min) / (max - min)) * 34
  const points = prices.map((p, i) => `${(i / (prices.length - 1)) * 100},${y(p).toFixed(1)}`).join(' ')

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">{t('sample.wishlist.a')}</span>
        <span className="badge badge-success">{t('sample.price.hit', { price: ron(prices[prices.length - 1]) })}</span>
      </div>
      <svg viewBox="0 0 100 44" role="img" aria-label={t('sample.price.chartAlt')} className="mt-3 h-24 w-full">
        {/* The target is the line the whole feature is about, so it is
            drawn as a rule across the plot rather than named in a legend. */}
        <line
          x1="0"
          x2="100"
          y1={y(target)}
          y2={y(target)}
          className="stroke-ink-faint"
          strokeWidth={0.7}
          strokeDasharray="3 2"
        />
        <polyline
          points={points}
          fill="none"
          className="stroke-brand-500 dark:stroke-brand-300"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx="100" cy={y(prices[prices.length - 1])} r={2.2} className="fill-green-600 dark:fill-green-400" />
      </svg>
      <div className="flex items-center justify-between text-xs text-ink-faint">
        <span>{t('sample.price.target', { price: ron(target) })}</span>
        <span>{t('sample.price.entries', { count: prices.length })}</span>
      </div>
    </div>
  )
}

/** A garage of three, which is the thing a free account cannot have. */
export async function GaragePreview() {
  const t = await getTranslations('demo')
  const vocabulary = await getAllVocabulary()

  const rows = [
    { key: 'a', mode: 'OFFROAD' as const, locked: false },
    { key: 'b', mode: 'DAILY_DRIVER' as const, locked: true },
    { key: 'c', mode: 'RESTORATION' as const, locked: true },
  ]

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.key}
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-border p-3 ${
            row.locked ? 'bg-surface-muted' : 'bg-surface'
          }`}
        >
          <span className="text-sm font-medium text-ink">{t(`sample.garage.${row.key}`)}</span>
          <span className="flex items-center gap-2">
            <span className="badge badge-neutral">{vocabulary[row.mode].label}</span>
            {row.locked && <span className="badge badge-brand">{t('tierPro')}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The community feed, as the cards it is made of. */
export async function FeedPreview() {
  const t = await getTranslations('demo')
  const vocabulary = await getAllVocabulary()

  const cards = [
    { key: 'a', mode: 'OFFROAD' as const, progress: 62 },
    { key: 'b', mode: 'RESTORATION' as const, progress: 38 },
    { key: 'c', mode: 'DAILY_DRIVER' as const, progress: null },
  ]

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.key} className="overflow-hidden rounded-lg border border-surface-border">
          <div aria-hidden="true" className="h-12 bg-surface-subtle" />
          <div className="p-2">
            <div className="truncate text-xs font-medium text-ink">{t(`sample.feed.${card.key}`)}</div>
            <div className="mt-1 text-[11px] text-ink-faint">{vocabulary[card.mode].label}</div>
            {card.progress !== null ? (
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${card.progress}%` }} />
              </div>
            ) : (
              /* A daily driver has no completion to show — the feed says
                 how many jobs are logged instead. */
              <div className="mt-1.5 text-[11px] text-ink-faint">{t('sample.feed.jobs', { count: 34 })}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

/** The parts-wanted board: an ask, a place, and whoever answered. */
export async function PartsWantedPreview() {
  const t = await getTranslations('demo')

  const rows = [
    { key: 'a', replies: 3 },
    { key: 'b', replies: 0 },
  ]

  return (
    <ul className="divide-y divide-surface-border">
      {rows.map((row) => (
        <li key={row.key} className="py-2.5 first:pt-0 last:pb-0">
          <div className="text-sm font-medium text-ink">{t(`sample.parts.${row.key}.name`)}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-faint">
            <span>{t(`sample.parts.${row.key}.where`)}</span>
            <span aria-hidden="true">·</span>
            <span>{t('sample.parts.replies', { count: row.replies })}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** The feedback board, with the real ticket statuses and their palette. */
export async function RoadmapPreview() {
  const t = await getTranslations('demo')
  const tv = await getTranslations('ticketVocab')

  const rows = [
    { key: 'a', status: 'PLANNED' as const, votes: 27 },
    { key: 'b', status: 'IN_PROGRESS' as const, votes: 14 },
    { key: 'c', status: 'OPEN' as const, votes: 6 },
  ]

  return (
    <ul className="divide-y divide-surface-border">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg border border-surface-border text-xs font-semibold tabular-nums text-ink-muted">
            {row.votes}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{t(`sample.ticket.${row.key}`)}</span>
          <span className={`badge ${TICKET_STATUSES[row.status].badgeClass}`}>{tv(`status.${row.status}`)}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The language switcher, drawn from `LOCALE_NAMES` — the same list the
 * real toggle offers, each language written in its own language, which is
 * the point: somebody looking for English cannot be expected to recognise
 * "Engleză".
 */
export async function LanguagePreview() {
  const t = await getTranslations('demo')

  return (
    <div>
      <div className="inline-flex rounded-lg border border-surface-border p-0.5">
        {LOCALES.map((locale, index) => (
          <span
            key={locale}
            className={`rounded-md px-3 py-1.5 text-sm ${
              index === 0 ? 'bg-brand-500 text-white' : 'text-ink-muted'
            }`}
          >
            {LOCALE_NAMES[locale]}
          </span>
        ))}
      </div>
      <p className="mt-3 text-sm text-ink-muted">{t('sample.languageNote')}</p>
    </div>
  )
}

/**
 * The install prompt, in the app's own words — `install.title` and
 * `install.body` are the strings `InstallAppButton` shows for real.
 */
export async function InstallPreview() {
  const ti = await getTranslations('install')

  return (
    <div className="flex items-start gap-3 rounded-lg border border-surface-border bg-surface-muted p-4">
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-lg font-bold text-white"
      >
        R
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink">{ti('title')}</div>
        <p className="mt-0.5 text-xs text-ink-muted">{ti('body')}</p>
        <span className="btn-primary pointer-events-none mt-2 text-xs">{ti('button')}</span>
      </div>
    </div>
  )
}

/**
 * Light and dark side by side.
 *
 * The two panels are painted with literal palette values rather than the
 * theme tokens, because the whole point is to show both at once — a
 * `bg-surface` panel can only ever be whichever theme the reader is
 * already in. This is the one place in the app where a literal colour is
 * the correct choice, and these are the values `:root` and `.dark` set.
 */
export async function ThemePreview() {
  const t = await getTranslations('demo')

  const panels = [
    { key: 'light', surface: 'rgb(255 255 255)', border: 'rgb(211 217 224)', ink: 'rgb(19 23 28)', muted: 'rgb(84 92 104)' },
    { key: 'dark', surface: 'rgb(24 28 34)', border: 'rgb(52 60 70)', ink: 'rgb(230 234 238)', muted: 'rgb(156 165 176)' },
  ]

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {panels.map((panel) => (
        <div
          key={panel.key}
          className="rounded-lg border p-3"
          style={{ background: panel.surface, borderColor: panel.border }}
        >
          <div className="text-sm font-semibold" style={{ color: panel.ink }}>
            {t(`sample.theme.${panel.key}`)}
          </div>
          <div className="mt-1 text-xs" style={{ color: panel.muted }}>
            {t('sample.theme.note')}
          </div>
          <div className="mt-2 flex gap-1.5">
            <span className="h-3 w-8 rounded-full" style={{ background: 'rgb(37 99 235)' }} />
            <span className="h-3 w-8 rounded-full" style={{ background: panel.border }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The shortcut sheet, read straight out of `SHORTCUTS` and rendered with
 * `formatKeys()` — the same list and the same formatting the real help
 * dialog uses, so a rebound key moves here too.
 */
export async function ShortcutsPreview() {
  const ts = await getTranslations('shortcuts')

  return (
    <dl className="space-y-2">
      {SHORTCUTS.slice(0, 6).map((shortcut) => (
        <div key={shortcut.id} className="flex items-center justify-between gap-3">
          <dt className="min-w-0 truncate text-sm text-ink-muted">{ts(`item.${shortcut.id}`)}</dt>
          <dd className="shrink-0">
            {/* formatKeys joins a chord with the catalogue's own "then". */}
            <kbd>{formatKeys(shortcut.keys)}</kbd>
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The two data rights, in the app's own words — `dataExport.title` and
 * `dataExport.download` are what the settings page shows.
 */
export async function DataRightsPreview() {
  const t = await getTranslations('demo')
  const td = await getTranslations('dataExport')
  const ts = await getTranslations('settings')

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-surface-border p-3">
        <div className="text-sm font-semibold text-ink">{td('title')}</div>
        <p className="mt-0.5 text-xs text-ink-muted">{t('sample.data.exportNote')}</p>
        <span className="btn-secondary pointer-events-none mt-2 text-xs">{td('download')}</span>
      </div>
      <div className="rounded-lg border border-red-200 p-3 note-danger">
        <div className="text-sm font-semibold text-ink">{ts('dangerZone')}</div>
        <p className="mt-0.5 text-xs text-ink-muted">{t('sample.data.deleteNote')}</p>
        <span className="btn-danger pointer-events-none mt-2 text-xs">{ts('deleteAccount')}</span>
      </div>
    </div>
  )
}
