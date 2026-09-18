import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { DEMO_SECTIONS } from '@/lib/demoTour'
import { FREE_TIER } from '@/lib/pro'
import { PRO_PLANS } from '@/lib/stripe'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import DemoScreen from '@/components/demo/DemoScreen'
import DemoExplorer from '@/components/demo/DemoExplorer'
import DemoModeSwitcher from '@/components/demo/DemoModeSwitcher'
import {
  AnalyticsPreview,
  CardPreview,
  CollaboratorsPreview,
  CostsPreview,
  DataRightsPreview,
  DocumentsPreview,
  FeedPreview,
  FoundStatePreview,
  GaragePreview,
  InstallPreview,
  LanguagePreview,
  OriginalityPreview,
  PartsWantedPreview,
  PdfPreview,
  PhotosPreview,
  PriceAlertPreview,
  PublicBuildPreview,
  RoadmapPreview,
  ShortcutsPreview,
  TasksPreview,
  ThemePreview,
  TrailPreview,
  VinPreview,
  WishlistPreview,
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
 * previews draw the same components against invented rows, label
 * themselves as samples, and cost nothing to keep alive.
 *
 * ## What keeps it honest
 *
 * The three things a tour gets wrong as the product moves are the
 * vocabulary, the plan boundary, and the numbers. So none of them are
 * written here: the categories and statuses come from
 * `PROJECT_TYPE_CONFIG` through the vocabulary helpers, the free-tier
 * limits from `FREE_TIER` via `chapterValues()`, the prices from
 * `PRO_PLANS`, and which chapter is Pro is declared in
 * `src/lib/demoTour.ts` beside a test. Several previews go further and
 * run the real thing — `VinPreview` actually decodes a chassis number,
 * `ShortcutsPreview` reads `SHORTCUTS`, `OriginalityPreview` uses the
 * real condition vocabulary — so they cannot describe behaviour the app
 * no longer has.
 *
 * ## Server-rendered previews inside a client explorer
 *
 * `DemoExplorer` is a Client Component because picking a category and a
 * feature is what makes this a tour rather than a list. The previews
 * stay Server Components and are handed to it as a map of nodes: they
 * read translations and, in one case, run a decoder, and none of that
 * needs to reach the browser. React renders them on the server and the
 * explorer only chooses which one is on screen.
 */
export default async function DemoPage() {
  const t = await getTranslations('demo')

  /**
   * Every chapter's screen, already rendered.
   *
   * Framed here rather than inside each preview so the "sample data"
   * caption cannot be forgotten on a new one — a preview that quietly
   * shipped without it would be the only unlabelled invented data on the
   * page, which is the one thing this page must not do.
   */
  const label = (id: string) => t(`chapter.${id}.title`)
  const screen = (id: string, body: React.ReactNode) => (
    <DemoScreen label={label(id)}>{body}</DemoScreen>
  )

  const previews: Record<string, React.ReactNode> = {
    modes: screen('modes', <DemoModeSwitcher />),
    tasks: screen('tasks', <TasksPreview />),
    photos: screen('photos', <PhotosPreview />),
    documents: screen('documents', <DocumentsPreview />),
    costs: screen('costs', <CostsPreview />),
    wishlist: screen('wishlist', <WishlistPreview />),
    foundState: screen('foundState', <FoundStatePreview />),
    jobReport: screen('jobReport', <PdfPreview scope="job" />),
    analytics: screen('analytics', <AnalyticsPreview />),
    collaborators: screen('collaborators', <CollaboratorsPreview />),
    trailLog: screen('trailLog', <TrailPreview />),
    cards: screen('cards', <CardPreview />),
    limits: screen('limits', <GaragePreview />),
    pdfExport: screen('pdfExport', <PdfPreview scope="history" />),
    originality: screen('originality', <OriginalityPreview />),
    vinDecoder: screen('vinDecoder', <VinPreview />),
    priceAlert: screen('priceAlert', <PriceAlertPreview />),
    publicBuild: screen('publicBuild', <PublicBuildPreview />),
    feed: screen('feed', <FeedPreview />),
    partsWanted: screen('partsWanted', <PartsWantedPreview />),
    roadmap: screen('roadmap', <RoadmapPreview />),
    languages: screen('languages', <LanguagePreview />),
    install: screen('install', <InstallPreview />),
    theme: screen('theme', <ThemePreview />),
    shortcuts: screen('shortcuts', <ShortcutsPreview />),
    yourData: screen('yourData', <DataRightsPreview />),
  }

  const featureCount = DEMO_SECTIONS.reduce((sum, section) => sum + section.chapters.length, 0)

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <section className="border-b border-surface-border bg-gradient-to-b from-brand-50 to-surface dark:from-brand-400/10">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-ink sm:text-5xl">
            {t('heroTitle')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
            {t('heroBody', { count: featureCount })}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/register" className="btn-primary px-6 py-3 text-base">
              {t('ctaStart')}
            </Link>
            <Link href="/community" className="btn-secondary px-6 py-3 text-base">
              {t('ctaBrowse')}
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-faint">{t('heroNote')}</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <DemoExplorer previews={previews} />
      </section>

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
