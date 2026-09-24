'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  DEMO_CHAPTERS,
  DEMO_SECTIONS,
  DEMO_TIERS,
  TIER_BADGE,
  TIER_LABEL_KEY,
  chapterValues,
  type DemoChapter,
  type DemoTier,
} from '@/lib/demoTour'
import { PROJECT_TYPES, type ProjectType } from '@/lib/projectType'
import { useAllVocabulary } from '@/lib/vocabulary'

/**
 * The tour, as something to move around in rather than scroll past.
 *
 * Forty-two features is too many for one page of prose — the reader who
 * wants to know whether it handles their ITP should not have to walk
 * through the trail log to find out. So the sections become categories
 * you pick between, each category is a list you pick from, and the panel
 * beside it shows that one feature with its sample screen.
 *
 * ## Everything is rendered, most of it is hidden
 *
 * Each chapter's panel is in the HTML from the first response, with
 * `hidden` on the ones not being shown. The alternative — mounting the
 * selected panel only — would leave forty-one of the forty-two
 * features out of the page a crawler reads and out of the reader's
 * Ctrl+F. The previews are small and static, so the cost of having them
 * all there is a slightly larger document, once.
 *
 * ## Why toggle buttons rather than a tablist
 *
 * `role="tablist"` comes with a keyboard contract — arrow keys move
 * between tabs, Tab leaves the set — and a tablist that only answers to
 * Tab is worse than no tab semantics at all. `aria-pressed` on ordinary
 * buttons is honest about what these are and needs nothing added.
 */

type TierFilter = 'all' | DemoTier
type ModeFilter = 'all' | ProjectType

/** A chapter with no `modes` is in every mode. */
function matchesMode(chapter: DemoChapter, mode: ModeFilter): boolean {
  return mode === 'all' || !chapter.modes || chapter.modes.includes(mode)
}

function matchesTier(chapter: DemoChapter, tier: TierFilter): boolean {
  return tier === 'all' || chapter.tier === tier
}

export default function DemoExplorer({ previews }: { previews: Record<string, React.ReactNode> }) {
  const t = useTranslations('demo')
  const vocabulary = useAllVocabulary()

  const [sectionId, setSectionId] = useState(DEMO_SECTIONS[0].id)
  const [chapterId, setChapterId] = useState(DEMO_SECTIONS[0].chapters[0].id)
  const [tier, setTier] = useState<TierFilter>('all')
  const [mode, setMode] = useState<ModeFilter>('all')

  /**
   * `/demo#analytics` opens on that feature, and `/demo#pro` on that
   * category — on arrival, and again whenever the hash changes.
   *
   * Listening as well as reading once is what makes a link to another
   * part of the tour work from inside the tour: changing only the
   * fragment is a same-document navigation, so nothing remounts and a
   * mount-only read would sit there doing nothing. The `replaceState`
   * below does not fight it — programmatic history replacement fires no
   * `hashchange`, only a real navigation does.
   */
  useEffect(() => {
    const apply = () => {
      const target = decodeURIComponent(window.location.hash.replace(/^#/, ''))
      if (!target) return
      const section = DEMO_SECTIONS.find((s) => s.id === target)
      if (section) {
        setSectionId(section.id)
        setChapterId(section.chapters[0].id)
        return
      }
      const owner = DEMO_SECTIONS.find((s) => s.chapters.some((c) => c.id === target))
      if (owner) {
        setSectionId(owner.id)
        setChapterId(target)
      }
      // A hash naming nothing here is left alone: whatever is open stays
      // open, which is better than resetting somebody to the first
      // feature because a link had a typo in it.
    }
    apply()
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [])

  const visibleBySection = useMemo(() => {
    const entries = DEMO_SECTIONS.map((section) => [
      section.id,
      section.chapters.filter((c) => matchesTier(c, tier) && matchesMode(c, mode)),
    ] as const)
    return Object.fromEntries(entries) as Record<string, DemoChapter[]>
  }, [tier, mode])

  const visible = visibleBySection[sectionId] ?? []
  // A filter can hide whatever was selected. Fall through to the first
  // thing still on screen rather than showing an empty panel beside a
  // list that plainly has entries in it.
  const active = visible.find((c) => c.id === chapterId) ?? visible[0] ?? null

  /**
   * Keep the address bar on the open feature, without filling the back
   * button with every click on the way there — `replaceState`, not
   * `pushState`. Nothing here is a navigation; it is one page being read.
   */
  useEffect(() => {
    if (!active) return
    window.history.replaceState(null, '', `#${active.id}`)
  }, [active])

  const select = (section: string, chapter: string) => {
    setSectionId(section)
    setChapterId(chapter)
  }

  /** "Restoration project only", for a feature that exists in one mode. */
  const modeNote = (chapter: DemoChapter) =>
    chapter.modes ? t('onlyIn', { modes: chapter.modes.map((m) => vocabulary[m].label).join(' · ') }) : null

  const tierBadge = (chapter: DemoChapter) => (
    <span className={`badge ${TIER_BADGE[chapter.tier]}`}>
      {t(TIER_LABEL_KEY[chapter.tier])}
    </span>
  )

  const chip = (selected: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
      selected
        ? 'border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-400/15 dark:text-brand-200'
        : 'border-surface-border bg-surface text-ink-muted hover:text-ink'
    }`

  return (
    <div>
      {/*
        Without JavaScript the picker cannot pick, and forty-one of the
        forty-two panels would stay `hidden` — one feature instead of a
        tour. So a no-script reader gets the plain version: the controls
        that do nothing are taken away, and every panel is shown, stacked.
        It is the page this used to be before the explorer, which is a
        perfectly good fallback.
      */}
      <noscript>
        <style>{`
          [data-demo-controls] { display: none !important; }
          [data-demo-panel][hidden] { display: block !important; }
          [data-demo-panel] + [data-demo-panel] { margin-top: 3rem; }
        `}</style>
      </noscript>

      {/* Categories */}
      <div data-demo-controls role="group" aria-label={t('categories')} className="flex flex-wrap gap-2">
        {DEMO_SECTIONS.map((section) => {
          const count = visibleBySection[section.id].length
          const selected = section.id === sectionId
          return (
            <button
              key={section.id}
              type="button"
              aria-pressed={selected}
              onClick={() => select(section.id, visibleBySection[section.id][0]?.id ?? '')}
              className={`rounded-xl border px-4 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                selected
                  ? 'border-brand-400 bg-brand-50 dark:bg-brand-400/15'
                  : 'border-surface-border bg-surface hover:border-ink-faint'
              }`}
            >
              <span className={`block text-sm font-semibold ${selected ? 'text-brand-700 dark:text-brand-200' : 'text-ink'}`}>
                {t(`section.${section.id}.eyebrow`)}
              </span>
              <span className="block text-xs text-ink-faint">{t('countFeatures', { count })}</span>
            </button>
          )
        })}
      </div>

      <p data-demo-controls className="mt-4 max-w-2xl text-sm text-ink-muted">
        {t(`section.${sectionId}.body`)}
      </p>

      {/* Filters. Two questions people actually arrive with: does this
          cost money, and does it apply to what I drive. */}
      <div data-demo-controls className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label={t('filters.plan')} className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('filters.plan')}</span>
          {(['all', ...DEMO_TIERS] as TierFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tier === value}
              onClick={() => setTier(value)}
              className={chip(tier === value)}
            >
              {value === 'all' ? t('filters.all') : t(TIER_LABEL_KEY[value])}
            </button>
          ))}
        </div>

        <div role="group" aria-label={t('filters.mode')} className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{t('filters.mode')}</span>
          {(['all', ...PROJECT_TYPES] as ModeFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={chip(mode === value)}
            >
              {value === 'all' ? t('filters.all') : vocabulary[value].label}
            </button>
          ))}
        </div>
      </div>

      {/* Both tracks are minmax(0, …) at every width. A grid item defaults
          to min-width:auto, so the scrolling chip row below would size the
          single-column track to the full width of its contents and push
          the page sideways instead of scrolling inside itself. */}
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* The feature list. A scrolling row of chips on a phone, where a
            vertical list of nine would push the panel off the screen. */}
        <ul
          data-demo-controls
          aria-label={t('chooseFeature')}
          className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-2 md:mx-0 md:flex-col md:overflow-x-visible md:px-0 md:pb-0"
        >
          {visible.map((chapter) => {
            const selected = chapter.id === active?.id
            return (
              <li key={chapter.id} className="shrink-0 md:shrink">
                <button
                  type="button"
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => select(sectionId, chapter.id)}
                  className={`w-full whitespace-nowrap rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 md:whitespace-normal ${
                    selected
                      ? 'border-brand-400 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-400/15 dark:text-brand-200'
                      : 'border-transparent text-ink-muted hover:border-surface-border hover:text-ink'
                  }`}
                >
                  {t(`chapter.${chapter.id}.title`)}
                </button>
              </li>
            )
          })}
        </ul>

        {/*
          Every panel is here; all but one are `hidden`. See the note at
          the top — this is what keeps the other forty-one features in
          the page for a crawler and for the reader's own find-in-page.
        */}
        <div aria-live="polite" className="min-w-0">
          {visible.length === 0 && <p className="text-ink-muted">{t('noMatches')}</p>}
          {DEMO_CHAPTERS.map((chapter) => (
            <section
              key={chapter.id}
              id={chapter.id}
              data-demo-panel
              hidden={chapter.id !== active?.id}
              aria-labelledby={`${chapter.id}-title`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {tierBadge(chapter)}
                {modeNote(chapter) && <span className="text-xs text-ink-faint">{modeNote(chapter)}</span>}
              </div>
              <h3 id={`${chapter.id}-title`} className="text-xl font-semibold text-ink">
                {t(`chapter.${chapter.id}.title`)}
              </h3>
              <p className="mt-2 max-w-2xl text-ink-muted">
                {t(`chapter.${chapter.id}.body`, chapterValues(chapter.id))}
              </p>
              {chapter.href && (
                <Link
                  href={chapter.href}
                  className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  {t('seeItLive')}
                </Link>
              )}
              {previews[chapter.id] && <div className="mt-5">{previews[chapter.id]}</div>}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
