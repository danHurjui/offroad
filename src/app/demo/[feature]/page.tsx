import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { appUrlForMetadata } from '@/lib/appUrl'
import { publicPageMetadata } from '@/lib/pageMetadata'
import { breadcrumbJsonLd } from '@/lib/structuredData'
import { DEMO_CHAPTERS, TIER_BADGE, TIER_LABEL_KEY, chapterValues, metaDescriptionFrom, sectionOf } from '@/lib/demoTour'
import { getAllVocabulary } from '@/lib/vocabulary'
import JsonLd from '@/components/JsonLd'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import { demoPreviews } from '@/components/demo/demoPreviews'
import { localizedHref } from '@/i18n/localizedHref'

type Params = { params: { feature: string } }

const chapterFor = (id: string) => DEMO_CHAPTERS.find((chapter) => chapter.id === id)

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const chapter = chapterFor(params.feature)
  if (!chapter) return {}
  const t = await getTranslations('demo')
  return await publicPageMetadata({
    path: `/demo/${chapter.id}`,
    title: `${t(`chapter.${chapter.id}.title`)} — RigLog`,
    description: metaDescriptionFrom(t(`chapter.${chapter.id}.body`, chapterValues(chapter.id))),
    image: `/og?feature=${chapter.id}`,
  })
}

/**
 * One feature of the tour on a page of its own.
 *
 * `/demo` holds every feature, but on one URL — and a fragment is not a
 * page to Search, so "aplicație consum mașină electrică" could only ever
 * land on a page about forty other things. Each chapter gets its own
 * address, title, description and heading here, with the same screen as
 * its panel in the tour (`demoPreviews()`, labelled as sample data by
 * `DemoScreen`), the other features of its section, and a way into the
 * whole tour. `/demo` stays the hub and links to every one of these, so
 * they are found by a crawler as well as listed in the sitemap.
 */
export default async function DemoFeaturePage({ params }: Params) {
  const chapter = chapterFor(params.feature)
  if (!chapter) notFound()
  const t = await getTranslations('demo')
  const [previews, vocabulary] = await Promise.all([demoPreviews(), getAllVocabulary()])
  const section = sectionOf(chapter.id)!
  const origin = appUrlForMetadata()
  const title = t(`chapter.${chapter.id}.title`)
  const siblings = section.chapters.filter((c) => c.id !== chapter.id)

  return (
    <div className="min-h-screen bg-background">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: 'RigLog', url: origin },
          { name: t('breadcrumb'), url: `${origin}/demo` },
          { name: title, url: `${origin}/demo/${chapter.id}` },
        ])}
      />
      <PublicHeader />

      <main className="mx-auto max-w-4xl px-4 py-10">
        <nav aria-label={t('breadcrumbLabel')} className="mb-6 text-sm text-ink-muted">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href={localizedHref('/demo')} className="text-brand-600 hover:underline dark:text-brand-300">
                {t('breadcrumb')}
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            <li>{t(`section.${section.id}.eyebrow`)}</li>
          </ol>
        </nav>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`badge ${TIER_BADGE[chapter.tier]}`}>{t(TIER_LABEL_KEY[chapter.tier])}</span>
          {chapter.modes && (
            <span className="text-xs text-ink-faint">
              {t('onlyIn', { modes: chapter.modes.map((m) => vocabulary[m].label).join(' · ') })}
            </span>
          )}
        </div>
        <h1 className="text-3xl font-bold leading-tight text-ink sm:text-4xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-muted">{t(`chapter.${chapter.id}.body`, chapterValues(chapter.id))}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/register" className="btn-primary px-6 py-3 text-base">
            {t('ctaStart')}
          </Link>
          {chapter.href && (
            <Link href={chapter.href} className="btn-secondary px-6 py-3 text-base">
              {t('seeItLive')}
            </Link>
          )}
        </div>

        {previews[chapter.id] && <div className="mt-10">{previews[chapter.id]}</div>}

        {siblings.length > 0 && (
          <section className="mt-12 border-t border-surface-border pt-8" aria-labelledby="related-heading">
            <h2 id="related-heading" className="text-xl font-semibold text-ink">
              {t('moreIn', { section: t(`section.${section.id}.eyebrow`) })}
            </h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {siblings.map((c) => (
                <li key={c.id}>
                  <Link href={localizedHref(`/demo/${c.id}`)} className="font-medium text-brand-600 hover:underline dark:text-brand-300">
                    {t(`chapter.${c.id}.title`)}
                  </Link>{' '}
                  <span className="text-xs text-ink-faint">{t(TIER_LABEL_KEY[c.tier])}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="mt-10 text-sm">
          <Link href={`${localizedHref('/demo')}#${chapter.id}`} className="text-brand-600 hover:underline dark:text-brand-300">
            {t('wholeTour')}
          </Link>
        </p>
      </main>

      <PublicFooter />
    </div>
  )
}
