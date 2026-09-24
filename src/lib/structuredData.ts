import { PERSONAL_PLANS } from './stripe'
import { PERSONAL_PLAN_IDS } from './plans'
import { DONATION_CURRENCY } from './donations'

/**
 * JSON-LD for the public pages.
 *
 * Search engines read the marketing copy either way; this is the part
 * they are told rather than left to infer — that RigLog is an
 * application, that it runs in a browser, that there is a free tier and
 * what the paid one costs. That is exactly the set of questions somebody
 * typing "aplicație istoric service auto" is trying to answer before they
 * click, so it is worth stating in a form a machine cannot misread.
 *
 * ## What is here and what deliberately isn't
 *
 * `SoftwareApplication` is still a supported rich-result type and is the
 * right description of this product. `WebSite` carries the site-wide
 * search box. `BreadcrumbList` tells Search where a page sits.
 *
 * **There is no `FAQPage`.** Google retired the FAQ rich result outright
 * — restricted to health and government sites in 2023, gone from every
 * vertical on 7 May 2026, with the report and the Rich Results Test
 * following in June. The markup is still valid Schema.org and would do
 * nothing whatsoever in Search, so shipping it would be cargo cult. The
 * questions themselves are on `/demo` as ordinary prose, which is what
 * actually earns the long-tail query and is what an answer engine reads.
 *
 * ## Rules for anything added here
 *
 * Structured data must describe what is genuinely on the page — Google's
 * spam policy treats a mismatch as a manual-action offence, and it is
 * dishonest besides. So every value below is derived from the same
 * modules the page renders from (`PERSONAL_PLANS`, the tour catalogue) rather
 * than written out again, and nothing is claimed that a reader could not
 * verify on the page itself. No `aggregateRating`: there are no reviews,
 * and inventing one is the single most common way sites earn a penalty.
 */

/**
 * JSON-LD embedded in HTML, with the one escape that matters.
 *
 * A `</script>` inside a string value would end the script element early
 * and drop whatever followed into the document as markup. Nothing here
 * takes user input today, but this function is the boundary where that
 * would stop being true, so it escapes rather than trusting its callers.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

interface SiteFacts {
  /** Absolute origin, from `appUrlForMetadata()`. */
  url: string
  name: string
  description: string
  /** BCP-47 tag for the language the page is actually rendered in. */
  inLanguage: string
}

/**
 * The offers, from the same table the checkout charges against.
 *
 * Free first, because it is the one that matters to somebody deciding
 * whether to try it, and because a price shown for software that also has
 * a free tier without saying so is misleading. `Lifetime` is a one-off,
 * so it carries no billing period while the other two do.
 */
function offers() {
  const period = { month: 'P1M', year: 'P1Y' } as const

  return [
    {
      '@type': 'Offer',
      name: 'Free',
      price: 0,
      priceCurrency: DONATION_CURRENCY.toUpperCase(),
    },
    ...PERSONAL_PLAN_IDS.map((plan) => {
      const { label, priceRon, period: every } = PERSONAL_PLANS[plan]
      return {
        '@type': 'Offer',
        name: `Personal ${label}`,
        price: priceRon,
        priceCurrency: DONATION_CURRENCY.toUpperCase(),
        ...(every ? { billingDuration: period[every] } : {}),
      }
    }),
  ]
}

/**
 * A stable identity for the product itself.
 *
 * Both the homepage and the tour describe the same application — each is
 * the primary subject of its own page, so each carries the markup — and a
 * shared `@id` is what says "described twice" rather than "two different
 * products with the same name".
 */
export function softwareId(origin: string): string {
  return `${origin}/#software`
}

export function softwareApplicationJsonLd(site: SiteFacts, featureList: string[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': softwareId(site.url),
    name: site.name,
    description: site.description,
    url: site.url,
    // It is a PWA: it runs in a browser and installs to a home screen,
    // and there is no store listing to point at.
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web browser',
    browserRequirements: 'Requires JavaScript for the interactive parts',
    inLanguage: ['ro', 'en'],
    // Derived from the tour, so a feature added there is advertised here
    // and a feature removed stops being advertised.
    featureList,
    offers: offers(),
  }
}

export function webSiteJsonLd(site: SiteFacts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.url,
    description: site.description,
    inLanguage: site.inLanguage,
    // The community feed is the only search this site has that a stranger
    // can use; pointing at anything behind the session would be a box
    // that answers with a login screen.
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${site.url}/community?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  }
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}
