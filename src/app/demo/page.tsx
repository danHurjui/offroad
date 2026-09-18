import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { DEMO_SECTIONS, chapterValues, type DemoChapter } from '@/lib/demoTour'
import { FREE_TIER } from '@/lib/pro'
import { PRO_PLANS } from '@/lib/stripe'
import { getAllVocabulary } from '@/lib/vocabulary'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import DemoScreen from '@/components/demo/DemoScreen'
import DemoModeSwitcher from '@/components/demo/DemoModeSwitcher'
import {
  AnalyticsPreview,
  CardPreview,
  CollaboratorsPreview,
  DocumentsPreview,
  PhotosPreview,
  PublicBuildPreview,
  TasksPreview,
  TrailPreview,
} from '@/components/demo/previews'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('demo')
  return { title: t('metaTitle'), description: t('metaDescription') }
}

/**
 * The public tour: what RigLog does, shown rather than listed, with no
 * account and no session.
 *
 * ## Why this is mock-ups and not a demo account
 *
 * The obvious alternative is a shared logged-in account with seeded data.
 * It is worse on every axis that matters here: it is a real account, so
 * it is writable by everyone who finds it and looks vandalised by the
 * second visitor; it needs seeding, resetting and its own moderation; and
 * it cannot show a Pro feature without either granting Pro to an account
 * anyone can use or showing the upgrade wall instead of the feature. The
 * previews below draw the same components against invented rows, label
 * themselves as samples, and cost nothing to keep alive.
 *
 * ## What keeps it honest
 *
 * The three things a tour gets wrong as the product moves are the
 * vocabulary, the plan boundary, and the numbers. So none of them are
 * written here: the categories and statuses come from
 * `PROJECT_TYPE_CONFIG` through `getAllVocabulary()`, the free-tier
 * limits from `FREE_TIER`, the prices from `PRO_PLANS`, and which chapter
 * is Pro is declared in `src/lib/demoTour.ts` beside a test.
 */

/**
 * Which chapters are worth a picture.
 *
 * Not all of them — a page of twenty-five mock screens is a slideshow
 * nobody reaches the end of. These are the ones where the picture says
 * something the sentence cannot: what a job looks like written down, what
 * the money looks like added up, what a recorded track looks like.
 * Everything else is a card.
 */
const PREVIEWS: Record<string, () => React.ReactNode> = {
  modes: () => <DemoModeSwitcher />,
  tasks: () => <TasksPreview />,
  photos: () => <PhotosPreview />,
  documents: () => <DocumentsPreview />,
  analytics: () => <AnalyticsPreview />,
  collaborators: () => <CollaboratorsPreview />,
  trailLog: () => <TrailPreview />,
  cards: () => <CardPreview />,
  publicBuild: () => <PublicBuildPreview />,
}

export default async function DemoPage() {
  const t = await getTranslations('demo')
  const vocabulary = await getAllVocabulary()

  /** "Restoration only", for a chapter that exists in one mode. */
  const modeNote = (chapter: DemoChapter) =>
    chapter.modes ? t('onlyIn', { modes: chapter.modes.map((m) => vocabulary[m].label).join(' · ') }) : null

  const TierBadge = ({ chapter }: { chapter: DemoChapter }) => (
    <span className={`badge ${chapter.tier === 'pro' ? 'badge-brand' : 'badge-neutral'}`}>
      {t(chapter.tier === 'pro' ? 'tierPro' : 'tierFree')}
    </span>
  )

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="border-b border-surface-border bg-gradient-to-b from-brand-50 to-surface dark:from-brand-400/10">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">{t('heroBody')}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              {t('ctaStart')}
            </Link>
            <Link href="/community" className="btn-secondary px-6 py-3 text-base">
              {t('ctaBrowse')}
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-faint">{t('heroNote')}</p>

          {/* Contents. Plain anchors — the tour is long, and a reader who
              came for one thing should not have to scroll past the rest. */}
          <nav aria-label={t('contents')} className="mt-8 flex flex-wrap justify-center gap-2">
            {DEMO_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-surface-border bg-surface px-3 py-1.5 text-sm text-ink-muted hover:text-ink"
              >
                {t(`section.${section.id}.eyebrow`)}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {DEMO_SECTIONS.map((section) => {
        const featured = section.chapters.filter((c) => PREVIEWS[c.id])
        const rest = section.chapters.filter((c) => !PREVIEWS[c.id])

        return (
          <section
            key={section.id}
            id={section.id}
            className="mx-auto max-w-5xl scroll-mt-20 px-4 py-14"
            aria-labelledby={`${section.id}-heading`}
          >
            <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-300">
              {t(`section.${section.id}.eyebrow`)}
            </div>
            <h2 id={`${section.id}-heading`} className="text-2xl font-bold text-ink sm:text-3xl">
              {t(`section.${section.id}.title`)}
            </h2>
            <p className="mt-3 max-w-2xl text-ink-muted">{t(`section.${section.id}.body`)}</p>

            <div className="mt-10 space-y-12">
              {featured.map((chapter, index) => (
                <div
                  key={chapter.id}
                  id={chapter.id}
                  className="grid scroll-mt-20 items-center gap-6 md:grid-cols-2"
                >
                  {/* Alternating sides, and the text comes first in the
                      DOM either way — `md:order-2` moves it visually
                      without moving it for a screen reader or for a phone,
                      where everything is one column anyway. */}
                  <div className={index % 2 === 1 ? 'md:order-2' : undefined}>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <TierBadge chapter={chapter} />
                      {modeNote(chapter) && (
                        <span className="text-xs text-ink-faint">{modeNote(chapter)}</span>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-ink">{t(`chapter.${chapter.id}.title`)}</h3>
                    <p className="mt-2 text-ink-muted">
                      {t(`chapter.${chapter.id}.body`, chapterValues(chapter.id))}
                    </p>
                    {chapter.href && (
                      <Link
                        href={chapter.href}
                        className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                      >
                        {t('seeItLive')}
                      </Link>
                    )}
                  </div>
                  <DemoScreen label={t(`chapter.${chapter.id}.title`)}>
                    {PREVIEWS[chapter.id]()}
                  </DemoScreen>
                </div>
              ))}
            </div>

            {rest.length > 0 && (
              <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((chapter) => (
                  <div key={chapter.id} id={chapter.id} className="card flex scroll-mt-20 flex-col p-5">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <TierBadge chapter={chapter} />
                      {modeNote(chapter) && (
                        <span className="text-xs text-ink-faint">{modeNote(chapter)}</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-ink">{t(`chapter.${chapter.id}.title`)}</h3>
                    <p className="mt-1.5 text-sm text-ink-muted">
                      {t(`chapter.${chapter.id}.body`, chapterValues(chapter.id))}
                    </p>
                    {chapter.href && (
                      <Link
                        href={chapter.href}
                        className="mt-3 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                      >
                        {t('seeItLive')}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}

      <section className="border-t border-surface-border bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-ink sm:text-3xl">{t('closingTitle')}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-ink-muted">
            {t('closingBody', { vehicles: FREE_TIER.vehicles, price: PRO_PLANS.MONTHLY.priceRon })}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              {t('ctaStart')}
            </Link>
            <Link href="/" className="btn-secondary px-6 py-3 text-base">
              {t('ctaPricing')}
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}
