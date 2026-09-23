import fs from 'fs'
import path from 'path'
import { sortGarage, summarizeGarage, type GarageTask, type GarageVehicle } from '@/lib/garage'
import { GARAGE_DENSITY_KEY, readGarageDensity, writeGarageDensity } from '@/lib/garageDensity'

const NOW = new Date('2026-09-23T12:00:00Z')
const day = (d: string) => new Date(`${d}T00:00:00Z`)

const vehicle = (o: Partial<GarageVehicle> = {}): GarageVehicle => ({
  id: 'v1', ownerId: 'me', projectType: 'OFFROAD', year: 2012, make: 'Toyota', model: 'Land Cruiser',
  hideCostsFromCollaborators: false, updatedAt: day('2026-01-01'), ...o,
})
const task = (o: Partial<GarageTask> = {}): GarageTask => ({
  vehicleId: 'v1', status: 'DONE', category: 'SUSPENSION', date: day('2026-02-01'), workType: 'DIY',
  costRon: 100, partsCostRon: null, labourCostRon: null, updatedAt: day('2026-02-01'), ...o,
})

describe('summarizeGarage', () => {
  it('a mode that tracks completion shows a percentage; one that does not shows open jobs', () => {
    const [offroad, daily] = summarizeGarage(
      [vehicle(), vehicle({ id: 'v2', projectType: 'DAILY_DRIVER' })],
      [task(), task({ vehicleId: 'v2', status: 'DUE', category: 'BRAKES' }), task({ vehicleId: 'v2', status: 'DONE', category: 'BRAKES' })],
      [],
      'me',
      NOW
    )
    expect(offroad.figure.kind).toBe('progress')
    expect(daily.figure).toEqual({ kind: 'openJobs', count: 1 })
  })

  it('the soonest document, with its status from the shared function', () => {
    const [card] = summarizeGarage(
      [vehicle()],
      [],
      [
        { vehicleId: 'v1', type: 'RCA', expiryDate: day('2027-01-01') },
        { vehicleId: 'v1', type: 'ITP', expiryDate: day('2026-10-01') },
      ],
      'me',
      NOW
    )
    expect(card.soonestDocument).toMatchObject({ type: 'ITP', status: 'expiring' })
    expect(card.attention).toEqual(['document'])
  })

  it('an empty vehicle has no document and needs no attention — nothing is invented', () => {
    const [card] = summarizeGarage([vehicle()], [], [], 'me', NOW)
    expect(card.soonestDocument).toBeNull()
    expect(card.attention).toEqual([])
    expect(card.spend).toBe(0)
  })

  it('a job in a warn or danger status needs attention, read from the config', () => {
    const [broken] = summarizeGarage([vehicle()], [task({ status: 'BROKEN' })], [], 'me', NOW)
    expect(broken.attention).toEqual(['job'])
    const [planned] = summarizeGarage([vehicle()], [task({ status: 'PLANNED' })], [], 'me', NOW)
    expect(planned.attention).toEqual([])
  })

  it('spend counts workshop parts and labour, and is hidden from a collaborator when the owner hid costs', () => {
    const tasks = [task({ workType: 'WORKSHOP', costRon: 999, partsCostRon: 300, labourCostRon: 150.5 }), task()]
    expect(summarizeGarage([vehicle()], tasks, [], 'me', NOW)[0].spend).toBe(550.5)
    expect(summarizeGarage([vehicle({ ownerId: 'owner' })], tasks, [], 'mechanic', NOW)[0].spend).toBe(550.5)
    expect(summarizeGarage([vehicle({ ownerId: 'owner', hideCostsFromCollaborators: true })], tasks, [], 'mechanic', NOW)[0].spend).toBeNull()
  })

  it('a collaborator never sees the owner’s document expiry', () => {
    const [card] = summarizeGarage([vehicle({ ownerId: 'owner' })], [], [{ vehicleId: 'v1', type: 'ITP', expiryDate: day('2026-01-01') }], 'mechanic', NOW)
    expect(card.isOwner).toBe(false)
    expect(card.soonestDocument).toBeNull()
  })

  it('last activity is the newest of the vehicle and its jobs', () => {
    const [card] = summarizeGarage([vehicle()], [task({ updatedAt: day('2026-09-01') }), task({ updatedAt: day('2026-03-01') })], [], 'me', NOW)
    expect(card.lastActivity).toEqual(day('2026-09-01'))
  })
})

describe('sortGarage', () => {
  const cards = summarizeGarage(
    [
      vehicle({ id: 'quiet', make: 'Aro', updatedAt: day('2026-09-20') }),
      vehicle({ id: 'job', make: 'Dacia', updatedAt: day('2026-01-01') }),
      vehicle({ id: 'expired', make: 'Lada', updatedAt: day('2025-01-01') }),
      vehicle({ id: 'expiring', make: 'Mercedes', updatedAt: day('2025-06-01') }),
    ],
    [task({ vehicleId: 'job', status: 'BROKEN', updatedAt: day('2026-01-01') })],
    [
      { vehicleId: 'expired', type: 'RCA', expiryDate: day('2026-09-01') },
      { vehicleId: 'expiring', type: 'ITP', expiryDate: day('2026-10-10') },
    ],
    'me',
    NOW
  )
  const items = cards.map((card) => ({ card, name: card.vehicleId }))
  const order = (sort: Parameters<typeof sortGarage>[1]) => sortGarage(items, sort).map((i) => i.card.vehicleId)

  it('most urgent first: expired, then fewest days left, then a job, then the rest', () => {
    expect(order('attention')).toEqual(['expired', 'expiring', 'job', 'quiet'])
  })

  it('by last activity, newest first', () => {
    expect(order('activity')).toEqual(['quiet', 'job', 'expiring', 'expired'])
  })

  it('by name', () => {
    expect(order('name')).toEqual(['expired', 'expiring', 'job', 'quiet'])
  })
})

describe('the density preference', () => {
  it('defaults to cards, and survives storage that throws', () => {
    const throwing = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(readGarageDensity(undefined)).toBe('cards')
    expect(readGarageDensity(throwing)).toBe('cards')
    expect(() => writeGarageDensity(throwing, 'compact')).not.toThrow()
  })

  it('remembers compact', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    writeGarageDensity(storage, 'compact')
    expect(store.get(GARAGE_DENSITY_KEY)).toBe('compact')
    expect(readGarageDensity(storage)).toBe('compact')
  })
})

describe('the dashboard page', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/app/dashboard/(garage)/page.tsx'), 'utf8')

  it('reads every card’s numbers in batched queries, never per vehicle', () => {
    const card = page.slice(page.indexOf('async function VehicleCard'), page.indexOf('async function GarageControls'))
    expect(card).not.toMatch(/prisma\./)
    expect(page).toMatch(/vehicleId: \{ in: all\.map/)
  })

  it('gates the progress figure on tracksCompletion, not on a mode name', () => {
    const lib = fs.readFileSync(path.join(process.cwd(), 'src/lib/garage.ts'), 'utf8')
    expect(lib).toContain('config.tracksCompletion')
    expect(lib).not.toMatch(/'(OFFROAD|RESTORATION|DAILY_DRIVER)'/)
  })
})
