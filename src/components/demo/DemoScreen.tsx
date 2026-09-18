import { getTranslations } from 'next-intl/server'

/**
 * The frame every preview on the tour sits in.
 *
 * Two jobs. It makes a mock read as a screenshot of the app rather than
 * as part of the marketing page around it — the tour is a wall of prose
 * otherwise, and the app's own look is the thing worth showing. And it
 * carries the "sample data" caption, which is not decoration: these
 * previews are built from invented rows, and a page that shows fabricated
 * numbers in the product's own chrome without saying so is claiming
 * something it hasn't earned.
 *
 * A caption rather than a watermark, because it has to survive being read
 * aloud — it is inside the figure, so a screen reader reaches it in the
 * same breath as the preview.
 */
export default async function DemoScreen({
  label,
  children,
}: {
  /** What this is a picture of, for anyone who cannot see it. */
  label: string
  children: React.ReactNode
}) {
  const t = await getTranslations('demo')

  return (
    <figure className="m-0">
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface shadow-card">
        {/* Window chrome. Purely decorative, so it is hidden from the
            accessibility tree rather than announced as three bullets. */}
        <div
          aria-hidden="true"
          className="flex items-center gap-1.5 border-b border-surface-border bg-surface-muted px-3 py-2"
        >
          <span className="h-2.5 w-2.5 rounded-full bg-surface-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-surface-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-surface-border" />
        </div>
        <div className="p-4">{children}</div>
      </div>
      <figcaption className="mt-2 text-xs text-ink-faint">
        {label} · {t('sampleData')}
      </figcaption>
    </figure>
  )
}
