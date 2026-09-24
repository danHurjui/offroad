import fs from 'fs'
import path from 'path'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findMany: jest.fn() },
    ticket: { findMany: jest.fn() },
    partsRequest: { findMany: jest.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import sitemap from '@/app/sitemap'
import robots from '@/app/robots'

const mockVehicles = prisma.vehicle.findMany as jest.Mock
const mockTickets = prisma.ticket.findMany as jest.Mock
const mockPartsRequests = prisma.partsRequest.findMany as jest.Mock

/**
 * sitemap.ts and robots.ts are a pair, and Search Console reports every
 * way they can disagree: a URL listed here but disallowed there comes back
 * as "Blocked by robots.txt", once per URL.
 */
describe('sitemap.xml', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_URL = 'https://riglog.example'
    mockVehicles.mockResolvedValue([
      { slug: '1990-suzuki-samurai', updatedAt: new Date('2026-01-02'), owner: { username: 'dan' } },
    ])
    mockTickets.mockResolvedValue([{ id: 'tkt1', updatedAt: new Date('2026-02-03') }])
    mockPartsRequests.mockResolvedValue([{ id: 'req1', updatedAt: new Date('2026-03-04') }])
  })

  afterEach(() => {
    delete process.env.NEXTAUTH_URL
    jest.clearAllMocks()
  })

  const urls = async () => (await sitemap()).map((entry) => entry.url)

  it('lists the public pages', async () => {
    const listed = await urls()
    for (const page of ['', '/community', '/community/parts-wanted', '/tickets', '/donate', '/terms', '/privacy', '/cookies']) {
      expect(listed).toContain(`https://riglog.example${page}`)
    }
  })

  it('lists each published build', async () => {
    expect(await urls()).toContain('https://riglog.example/builds/dan/1990-suzuki-samurai')
  })

  it('lists individual tickets and parts requests', async () => {
    // Both are public pages with their own content and were missing
    // entirely, so they could only ever be found by following a link.
    const listed = await urls()
    expect(listed).toContain('https://riglog.example/tickets/tkt1')
    expect(listed).toContain('https://riglog.example/community/parts-wanted/req1')
  })

  it('carries lastModified on everything that has one', async () => {
    const entries = await sitemap()
    const build = entries.find((e) => e.url.includes('/builds/'))
    expect(build?.lastModified).toEqual(new Date('2026-01-02'))
  })

  it('skips a vehicle whose owner has no username yet', async () => {
    // Pitfall #12: username and slug are backfilled lazily, and a URL
    // built from a null reads "/builds/null/...".
    mockVehicles.mockResolvedValue([
      { slug: 'a-build', updatedAt: new Date(), owner: { username: null } },
    ])
    expect((await urls()).some((u) => u.includes('/builds/'))).toBe(false)
  })

  it('bounds the open-ended lists', async () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'sitemap.ts'), 'utf8')
    expect(source).toMatch(/take: MAX_TICKETS/)
    expect(source).toMatch(/take: MAX_PARTS_REQUESTS/)
  })

  it('never lists a URL robots.txt disallows', async () => {
    const rules = robots().rules
    const disallowed = (Array.isArray(rules) ? rules : [rules]).flatMap((r) =>
      Array.isArray(r.disallow) ? r.disallow : r.disallow ? [r.disallow] : []
    )
    const paths = (await urls()).map((u) => u.replace('https://riglog.example', '') || '/')

    for (const url of paths) {
      for (const rule of disallowed) {
        expect(url.startsWith(rule)).toBe(false)
      }
    }
  })
})

describe('sitemap.xml — feature pages and honest dates', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_URL = 'https://riglog.example'
    mockVehicles.mockResolvedValue([
      { slug: 'a', updatedAt: new Date('2026-01-02'), owner: { username: 'dan' } },
      { slug: 'b', updatedAt: new Date('2026-05-06'), owner: { username: 'dan' } },
    ])
    mockTickets.mockResolvedValue([{ id: 'tkt1', updatedAt: new Date('2026-02-03') }])
    mockPartsRequests.mockResolvedValue([])
  })
  afterEach(() => {
    delete process.env.NEXTAUTH_URL
    jest.clearAllMocks()
  })

  it('lists every feature of the tour on its own page', async () => {
    const { DEMO_CHAPTERS } = await import('@/lib/demoTour')
    const listed = (await sitemap()).map((e) => e.url)
    for (const chapter of DEMO_CHAPTERS) expect(listed).toContain(`https://riglog.example/demo/${chapter.id}`)
  })

  it('dates a list by its newest entry, the legal pages by their revision, and invents nothing', async () => {
    const { LEGAL_LAST_UPDATED } = await import('@/lib/legal')
    const byUrl = new Map((await sitemap()).map((e) => [e.url, e.lastModified]))
    expect(byUrl.get('https://riglog.example/community')).toEqual(new Date('2026-05-06'))
    expect(byUrl.get('https://riglog.example/tickets')).toEqual(new Date('2026-02-03'))
    expect(byUrl.get('https://riglog.example/community/parts-wanted')).toBeUndefined()
    expect(byUrl.get('https://riglog.example/terms')).toEqual(new Date(`${LEGAL_LAST_UPDATED}T00:00:00Z`))
    // Nothing records when the homepage or the tour changed: no date, never "now".
    expect(byUrl.get('https://riglog.example')).toBeUndefined()
    expect(byUrl.get('https://riglog.example/demo/fuel')).toBeUndefined()
  })
})
