import fs from 'fs'
import path from 'path'
import {
  breadcrumbJsonLd,
  serializeJsonLd,
  softwareApplicationJsonLd,
  softwareId,
  webSiteJsonLd,
} from '@/lib/structuredData'
import { DEMO_FAQ_IDS } from '@/lib/demoTour'
import { LOCALES } from '@/i18n/config'
import { PRO_PLANS } from '@/lib/stripe'

/**
 * Structured data is the one thing on these pages written for a machine,
 * which means nobody reads it after the day it ships. These are the
 * claims it makes that would be wrong, or punishable, if they drifted.
 */

const SITE = {
  url: 'https://riglog.example',
  name: 'RigLog',
  description: 'A car build, restoration and repair log',
  inLanguage: 'ro',
}

const CATALOGUES = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8')),
  ])
) as Record<string, { demo: Record<string, Record<string, { q: string; a: string }>> }>

describe('serializeJsonLd', () => {
  /**
   * The escape that matters. A `</script>` inside any string value would
   * close the script element early and drop the rest into the document as
   * markup — which is a scripting hole the day any of this comes from
   * something a user typed.
   */
  it('cannot break out of its own script tag', () => {
    const output = serializeJsonLd({ name: '</script><img src=x onerror=alert(1)>' })
    expect(output).not.toContain('</script>')
    expect(output).toContain('\\u003c/script')
  })

  it('still parses back to what went in', () => {
    const data = { name: 'a < b', nested: { list: [1, 2] } }
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data)
  })
})

describe('the software description', () => {
  const jsonLd = softwareApplicationJsonLd(SITE, ['Jobs', 'Photos'])

  it('quotes every plan at the price the checkout charges', () => {
    const offers = jsonLd.offers as { name: string; price: number; priceCurrency: string }[]
    for (const [plan, config] of Object.entries(PRO_PLANS)) {
      const offer = offers.find((o) => o.name === `Pro ${config.label}`)
      expect({ plan, price: offer?.price }).toEqual({ plan, price: config.priceRon })
    }
  })

  it('says there is a free tier at all', () => {
    // Listing only the paid plans reads as paid-only software, which
    // costs exactly the reader this page is for.
    const offers = jsonLd.offers as { name: string; price: number }[]
    expect(offers[0]).toMatchObject({ name: 'Free', price: 0 })
  })

  it('prices everything in RON', () => {
    const offers = jsonLd.offers as { priceCurrency: string }[]
    for (const offer of offers) expect(offer.priceCurrency).toBe('RON')
  })

  /**
   * Inventing a rating is the most common way a site earns a manual
   * action, and this product has no reviews to report. If somebody adds
   * one later it has to come from real reviews shown on the page.
   */
  it('claims no rating or review count', () => {
    expect(Object.keys(jsonLd)).not.toContain('aggregateRating')
    expect(Object.keys(jsonLd)).not.toContain('review')
  })

  it('carries the features it was given', () => {
    expect(jsonLd.featureList).toEqual(['Jobs', 'Photos'])
  })

  // The homepage and the tour both describe the product. Without one id
  // they describe two products that happen to share a name.
  it('is the same entity wherever it is described', () => {
    expect(jsonLd['@id']).toBe(softwareId(SITE.url))
    expect(softwareApplicationJsonLd({ ...SITE, description: 'other page' }, [])['@id']).toBe(jsonLd['@id'])
  })
})

describe('the site description', () => {
  it('points its search box at a page with no session behind it', () => {
    const action = webSiteJsonLd(SITE).potentialAction as { target: { urlTemplate: string } }
    expect(action.target.urlTemplate).toBe('https://riglog.example/community?q={search_term_string}')
    expect(action.target.urlTemplate).not.toContain('/dashboard')
  })
})

describe('breadcrumbs', () => {
  it('numbers the trail from one, in order', () => {
    const crumbs = breadcrumbJsonLd([
      { name: 'RigLog', url: 'https://riglog.example' },
      { name: 'Features', url: 'https://riglog.example/demo' },
    ]).itemListElement as { position: number; name: string }[]
    expect(crumbs.map((c) => c.position)).toEqual([1, 2])
    expect(crumbs.map((c) => c.name)).toEqual(['RigLog', 'Features'])
  })
})

describe.each(LOCALES)('the questions on /demo in %s', (locale) => {
  const faq = CATALOGUES[locale].demo.faq

  it('answers every question it lists', () => {
    for (const id of DEMO_FAQ_IDS) {
      expect({ id, q: faq[id]?.q, a: faq[id]?.a }).toMatchObject({
        id,
        q: expect.stringMatching(/\S/),
        a: expect.stringMatching(/\S/),
      })
    }
  })

  /**
   * The page passes exactly one value into these. An answer asking for
   * anything else renders with a hole in it, in one language, on the
   * paragraph that tells somebody what the product costs.
   */
  it('asks only for the price, and only where the page passes it', () => {
    for (const id of DEMO_FAQ_IDS) {
      const used = [...faq[id].a.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1])
      expect({ id, used: [...new Set(used)] }).toMatchObject({
        id,
        used: expect.arrayContaining([]),
      })
      for (const name of used) expect({ id, name }).toMatchObject({ id, name: 'price' })
    }
  })

  it('answers the money question first', () => {
    // It is the first thing anybody asks, and burying it reads as a
    // reason to bury it.
    expect(DEMO_FAQ_IDS[0]).toBe('free')
    expect(faq.free.a).toMatch(/\{price\}/)
  })
})
