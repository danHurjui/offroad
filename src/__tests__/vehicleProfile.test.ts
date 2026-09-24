import fs from 'fs'
import path from 'path'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn(), update: jest.fn(), count: jest.fn(), create: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import {
  PROFILE_FIELDS,
  kwToCp,
  matchesVehicleSearch,
  normalizePlate,
  parseProfile,
  plateSearchKey,
} from '@/lib/vehicleProfile'
import { PATCH } from '@/app/api/vehicles/[id]/route'
import { POST } from '@/app/api/vehicles/route'

const mockSession = getServerSession as jest.Mock
const mockFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockUpdate = prisma.vehicle.update as jest.Mock
const mockCreate = prisma.vehicle.create as jest.Mock
const mockUserFind = prisma.user.findUnique as jest.Mock
const mockFindFirst = prisma.vehicle.findFirst as jest.Mock

const NOW = new Date('2026-09-23T12:00:00Z')

describe('normalizePlate', () => {
  it('stores upper case with single spaces', () => {
    expect(normalizePlate('  b  123   abc ')).toBe('B 123 ABC')
    expect(normalizePlate('cj-12-xyz')).toBe('CJ-12-XYZ')
  })

  it('accepts real plates a strict Romanian pattern would refuse', () => {
    expect(normalizePlate('B 012345')).toBe('B 012345') // temporary
    expect(normalizePlate('M AB 1234')).toBe('M AB 1234') // German, mid-import
  })

  it('treats empty as no plate, and junk as not a plate', () => {
    expect(normalizePlate('')).toBeNull()
    expect(normalizePlate('   ')).toBeNull()
    expect(normalizePlate(null)).toBeNull()
    expect(normalizePlate('B 123 ABC!')).toBe(false)
    expect(normalizePlate('<script>')).toBe(false)
    expect(normalizePlate('ABCDEFGHIJKLM')).toBe(false)
    expect(normalizePlate(123)).toBe(false)
  })
})

describe('parseProfile', () => {
  it('returns only the fields that were sent', () => {
    expect(parseProfile({ make: 'Dacia' }, NOW)).toEqual({ ok: true, data: {} })
    expect(parseProfile({ seats: '5' }, NOW)).toEqual({ ok: true, data: { seats: 5 } })
  })

  it('clears a field sent empty', () => {
    const parsed = parseProfile({ plate: '', fuelType: '', powerKw: '', firstRegistrationDate: '' }, NOW)
    expect(parsed).toEqual({
      ok: true,
      data: { plate: null, fuelType: null, powerKw: null, firstRegistrationDate: null },
    })
  })

  it('accepts a full talon', () => {
    const parsed = parseProfile(
      {
        plate: 'b 123 abc',
        firstRegistrationDate: '2015-06-01',
        fuelType: 'DIESEL',
        transmission: 'MANUAL',
        engineCapacityCc: '1461',
        powerKw: 66,
        colour: ' Gri Comète ',
        seats: '5',
      },
      NOW
    )
    expect(parsed).toEqual({
      ok: true,
      data: {
        plate: 'B 123 ABC',
        firstRegistrationDate: new Date('2015-06-01'),
        fuelType: 'DIESEL',
        transmission: 'MANUAL',
        engineCapacityCc: 1461,
        powerKw: 66,
        colour: 'Gri Comète',
        seats: 5,
      },
    })
  })

  it.each([
    [{ plate: 'B@123' }, 'plate'],
    [{ firstRegistrationDate: '2027-01-01' }, 'firstRegistrationDate'],
    [{ firstRegistrationDate: '1850-01-01' }, 'firstRegistrationDate'],
    [{ firstRegistrationDate: 'soon' }, 'firstRegistrationDate'],
    [{ fuelType: 'Diesel' }, 'fuelType'],
    [{ transmission: 'CVT' }, 'transmission'],
    [{ engineCapacityCc: '14610' + '0' }, 'engineCapacityCc'],
    [{ powerKw: '66.5' }, 'powerKw'],
    [{ seats: 0 }, 'seats'],
    [{ colour: 'x'.repeat(41) }, 'colour'],
  ])('names the field it refuses: %j', (body, field) => {
    expect(parseProfile(body as Record<string, unknown>, NOW)).toEqual({ ok: false, field })
  })

  it('validates values, never translated labels', () => {
    // A Romanian label must not pass as the code it labels.
    expect(parseProfile({ fuelType: 'Motorină' }, NOW)).toEqual({ ok: false, field: 'fuelType' })
  })
})

describe('matchesVehicleSearch', () => {
  const logan = { plate: 'B 123 ABC', make: 'Dacia', model: 'Logan', year: 2015, generation: null }

  it('finds a plate however it is typed', () => {
    for (const q of ['B123ABC', 'b 123 abc', 'B-123-ABC', '123 ab']) expect(matchesVehicleSearch(logan, q)).toBe(true)
  })

  it('finds make, model and year', () => {
    expect(matchesVehicleSearch(logan, 'logan')).toBe(true)
    expect(matchesVehicleSearch(logan, '2015 dacia')).toBe(true)
    expect(matchesVehicleSearch(logan, 'duster')).toBe(false)
  })

  it('does not match a plate-looking query against a vehicle with no plate', () => {
    expect(matchesVehicleSearch({ ...logan, plate: null }, 'B123')).toBe(false)
  })

  it('matches everything for an empty query', () => {
    expect(matchesVehicleSearch(logan, '  ')).toBe(true)
  })
})

describe('small helpers', () => {
  it('converts kW to the CP listings quote', () => {
    expect(kwToCp(66)).toBe(90)
    expect(kwToCp(110)).toBe(150)
  })

  it('keys plates on letters and digits only', () => {
    expect(plateSearchKey('b-12 x')).toBe('B12X')
  })
})

/**
 * The plate is identifying, like the raw VIN, and must never reach a
 * page a stranger can load. These files are every public surface that
 * reads a vehicle; none of them may so much as mention it.
 */
describe('the plate stays off public surfaces', () => {
  const PUBLIC = [
    'src/app/builds/[username]/[slug]/page.tsx',
    'src/app/community/page.tsx',
    'src/app/sitemap.ts',
    'src/app/api/vehicles/[id]/card/build/route.tsx',
    'src/app/api/vehicles/[id]/card/transformation/route.tsx',
    'src/lib/card.tsx',
    'src/lib/structuredData.ts',
    'src/lib/pageMetadata.ts',
  ]

  it.each(PUBLIC)('%s never reads the plate', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    expect(source).not.toMatch(/\bplate\b|PlateBadge|RegistrationSummary/)
  })
})

describe('vehicle routes', () => {
  const VEHICLE = { id: 'v1', ownerId: 'owner', make: 'Dacia', model: 'Logan', year: 2015, slug: 's' }
  const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never

  beforeEach(() => {
    jest.clearAllMocks()
    mockSession.mockResolvedValue({ user: { id: 'owner' } })
    mockFindUnique.mockResolvedValue(VEHICLE)
    mockUpdate.mockImplementation(({ data }) => Promise.resolve({ ...VEHICLE, ...data }))
  })

  it('PATCH saves a normalised plate and the talon', async () => {
    const res = await PATCH(req({ plate: 'b 123 abc', fuelType: 'LPG', powerKw: '66' }), { params: { id: 'v1' } })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { plate: 'B 123 ABC', fuelType: 'LPG', powerKw: 66 },
    })
  })

  it('PATCH refuses an invalid field by name, and writes nothing', async () => {
    const res = await PATCH(req({ plate: 'B 123 ABC', seats: 500 }), { params: { id: 'v1' } })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('profileFieldInvalid')
    expect(body.error).toMatch(/seats/)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('PATCH stays owner-only for these fields too', async () => {
    mockSession.mockResolvedValue({ user: { id: 'collaborator' } })
    const res = await PATCH(req({ plate: 'B 1 X' }), { params: { id: 'v1' } })
    expect(res.status).toBe(404)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('POST accepts the plate at creation', async () => {
    mockUserFind.mockResolvedValue({ isPro: true, isProComped: false, proPlan: 'MONTHLY', grandfatheredAt: new Date('2026-10-03') })
    mockFindFirst.mockResolvedValue(null)
    mockCreate.mockImplementation(({ data }) => Promise.resolve({ id: 'new', ...data }))
    const res = await POST({
      json: () => Promise.resolve({ projectType: 'DAILY_DRIVER', make: 'Dacia', model: 'Logan', year: 2015, plate: 'cj 01 abc' }),
    } as never)
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ plate: 'CJ 01 ABC' }) })
  })

  it('knows every field it parses', () => {
    expect(PROFILE_FIELDS).toHaveLength(8)
  })
})
