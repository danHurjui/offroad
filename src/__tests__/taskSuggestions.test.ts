jest.mock('@/lib/prisma', () => ({
  prisma: { task: { findMany: jest.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { taskFieldSuggestions } from '@/lib/taskSuggestions'

const mockFindMany = prisma.task.findMany as jest.Mock

/** The two queries run in parallel: brands first, then workshops. */
function stub(brands: (string | null)[], workshops: (string | null)[]) {
  mockFindMany
    .mockResolvedValueOnce(brands.map((brand) => ({ brand })))
    .mockResolvedValueOnce(workshops.map((workshopName) => ({ workshopName })))
}

beforeEach(() => jest.clearAllMocks())

describe('taskFieldSuggestions', () => {
  it('returns the distinct values for the vehicle', async () => {
    stub(['Bilstein', 'OME'], ['Ionescu Auto'])
    expect(await taskFieldSuggestions('v1')).toEqual({
      brands: ['Bilstein', 'OME'],
      workshops: ['Ionescu Auto'],
    })
  })

  // Postgres `distinct` is case-sensitive, so the same shop typed two ways
  // survives the query and has to be collapsed here.
  it('collapses spellings that differ only in case or whitespace', async () => {
    stub(['Bilstein', 'bilstein', '  BILSTEIN  '], ['Ionescu Auto', 'ionescu auto'])
    const result = await taskFieldSuggestions('v1')
    expect(result.brands).toEqual(['Bilstein'])
    expect(result.workshops).toEqual(['Ionescu Auto'])
  })

  // Newest-first ordering means the first spelling seen is the most recent.
  it('keeps the most recently used spelling', async () => {
    stub(['BILSTEIN', 'Bilstein'], [])
    expect((await taskFieldSuggestions('v1')).brands).toEqual(['BILSTEIN'])
  })

  it('drops nulls and blank strings', async () => {
    stub([null, '', '   ', 'OME'], [null, 'Shop'])
    expect(await taskFieldSuggestions('v1')).toEqual({ brands: ['OME'], workshops: ['Shop'] })
  })

  it('returns empty lists for a vehicle with no history', async () => {
    stub([], [])
    expect(await taskFieldSuggestions('v1')).toEqual({ brands: [], workshops: [] })
  })

  // Scoping is the security-relevant part: this must never reach past the
  // vehicle the caller was already authorised for.
  it('scopes both queries to the given vehicle', async () => {
    stub([], [])
    await taskFieldSuggestions('vehicle-42')
    for (const call of mockFindMany.mock.calls) {
      expect(call[0].where.vehicleId).toBe('vehicle-42')
    }
  })

  it('never selects a cost field', async () => {
    stub([], [])
    await taskFieldSuggestions('v1')
    for (const call of mockFindMany.mock.calls) {
      const selected = Object.keys(call[0].select)
      expect(selected.some((k) => k.toLowerCase().includes('cost'))).toBe(false)
    }
  })

  it('bounds how much it fetches', async () => {
    stub([], [])
    await taskFieldSuggestions('v1')
    for (const call of mockFindMany.mock.calls) {
      expect(call[0].take).toBeGreaterThan(0)
      expect(call[0].take).toBeLessThanOrEqual(50)
    }
  })
})
