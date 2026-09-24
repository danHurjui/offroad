// RL-042: the read-only gate reads the owner's plan and vehicles, which
// these mocks do not model; readOnly.test.ts tests it on its own.
jest.mock('@/lib/vehicleAllowance', () => ({
  ...jest.requireActual('@/lib/vehicleAllowance'),
  refuseIfReadOnly: jest.fn(async () => null),
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}))
jest.mock('@/lib/vinDecoder', () => ({
  ...jest.requireActual('@/lib/vinDecoder'),
  decodeVin: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { decodeVin } from '@/lib/vinDecoder'
import { POST, PATCH } from '@/app/api/vehicles/[id]/vin-decode/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockVehicleUpdate = prisma.vehicle.update as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockDecodeVin = decodeVin as jest.Mock

const RESTORATION_VEHICLE = { id: 'v1', ownerId: 'owner', projectType: 'RESTORATION', vin: 'UU1BSDAAHA1234567', year: 2010 }
const params = { id: 'v1' }

function req(body?: unknown) {
  return { json: () => Promise.resolve(body ?? {}) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(RESTORATION_VEHICLE)
  mockUserFindUnique.mockResolvedValue({ isPro: true })
})

describe('POST /api/vehicles/[id]/vin-decode', () => {
  it('returns 400 for an off-road vehicle', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...RESTORATION_VEHICLE, projectType: 'OFFROAD' })
    const res = await POST(req(), { params })
    expect(res.status).toBe(400)
  })

  it('returns 403 UPGRADE_REQUIRED for a free-tier owner', async () => {
    mockUserFindUnique.mockResolvedValue({ isPro: false })
    const res = await POST(req(), { params })
    expect(res.status).toBe(403)
  })

  it('returns 400 when the vehicle has no VIN on file', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...RESTORATION_VEHICLE, vin: null })
    const res = await POST(req(), { params })
    expect(res.status).toBe(400)
  })

  it('returns { decoded: null } without persisting when the VIN cannot be decoded', async () => {
    mockDecodeVin.mockResolvedValue(null)
    const res = await POST(req(), { params })
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.decoded).toBeNull()
    expect(mockVehicleUpdate).not.toHaveBeenCalled()
  })

  it('persists a successful decode', async () => {
    mockDecodeVin.mockResolvedValue({
      decoded: { manufacturer: 'Dacia', modelYear: 2010, factory: 'Mioveni, Romania', engineCode: null, bodyStyle: null, colorCode: null },
      source: 'local',
    })
    mockVehicleUpdate.mockResolvedValue({})
    const res = await POST(req(), { params })
    expect(res.status).toBe(200)
    expect(mockVehicleUpdate).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { vinDecoded: expect.objectContaining({ manufacturer: 'Dacia' }), vinDecodeSource: 'local' },
    })
  })
})

describe('PATCH /api/vehicles/[id]/vin-decode', () => {
  it('saves manual entry with source "manual"', async () => {
    mockVehicleUpdate.mockResolvedValue({ vinDecoded: { manufacturer: 'ARO' }, vinDecodeSource: 'manual' })
    const res = await PATCH(req({ manufacturer: 'ARO', modelYear: '1985' }), { params })
    expect(res.status).toBe(200)
    expect(mockVehicleUpdate).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: {
        vinDecoded: { manufacturer: 'ARO', modelYear: 1985, factory: null, engineCode: null, bodyStyle: null, colorCode: null },
        vinDecodeSource: 'manual',
      },
    })
  })

  it('returns 403 for a non-owner', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...RESTORATION_VEHICLE, ownerId: 'someone-else' })
    const res = await PATCH(req({ manufacturer: 'ARO' }), { params })
    expect(res.status).toBe(404)
  })
})
