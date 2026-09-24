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
    vehicle: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    tyreSet: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { parseTyreSet } from '@/lib/tyres'
import { POST } from '@/app/api/vehicles/[id]/tyres/route'
import { DELETE, PATCH } from '@/app/api/vehicles/[id]/tyres/[setId]/route'

const NOW = new Date('2026-09-23T12:00:00Z')
const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never

describe('parseTyreSet', () => {
  it('needs a season on create, and only what is sent on edit', () => {
    expect(parseTyreSet({}, { requireSeason: true }, NOW)).toEqual({ ok: false, field: 'season' })
    expect(parseTyreSet({ notes: 'x' }, { requireSeason: false }, NOW)).toEqual({ ok: true, data: { notes: 'x' } })
  })

  it('stamps a tread depth with the day it was measured', () => {
    expect(parseTyreSet({ treadDepthMm: '4,5' }, { requireSeason: false }, NOW)).toEqual({
      ok: true,
      data: { treadDepthMm: 4.5, treadMeasuredAt: new Date('2026-09-23T00:00:00Z') },
    })
  })

  it.each([
    [{ season: 'SPRING' }, 'season'],
    [{ season: 'WINTER', dotYear: 1960 }, 'dotYear'],
    [{ season: 'WINTER', dotYear: 2030 }, 'dotYear'],
    [{ season: 'WINTER', treadDepthMm: 25 }, 'treadDepthMm'],
    [{ season: 'WINTER', fittedAt: '2999-01-01' }, 'fittedAt'],
    [{ season: 'WINTER', fittedKm: -1 }, 'fittedKm'],
    [{ season: 'WINTER', label: 'x'.repeat(81) }, 'label'],
  ])('refuses %j', (body, field) => {
    expect(parseTyreSet(body, { requireSeason: true }, NOW)).toEqual({ ok: false, field })
  })
})

describe('tyre routes', () => {
  const mockSession = getServerSession as jest.Mock
  beforeEach(() => {
    jest.clearAllMocks()
    ;(prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
    mockSession.mockResolvedValue({ user: { id: 'owner' } })
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ id: 'v1', ownerId: 'owner' })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.tyreSet.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data }))
    ;(prisma.tyreSet.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data }))
  })

  it('fitting a new set unfits the others — a car wears one set at a time', async () => {
    const res = await POST(req({ season: 'WINTER', isFitted: true }), { params: { id: 'v1' } })
    expect(res.status).toBe(201)
    expect(prisma.tyreSet.updateMany).toHaveBeenCalledWith({ where: { vehicleId: 'v1' }, data: { isFitted: false } })
    expect(prisma.tyreSet.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ season: 'WINTER', isFitted: true, createdByUserId: 'owner' }),
    })
  })

  it('adding a stored set leaves the fitted one alone', async () => {
    await POST(req({ season: 'SUMMER' }), { params: { id: 'v1' } })
    expect(prisma.tyreSet.updateMany).not.toHaveBeenCalled()
  })

  it('names the invalid field', async () => {
    const res = await POST(req({ season: 'WINTER', dotYear: 1900 }), { params: { id: 'v1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/dotYear/)
  })

  it('PATCH marking a set fitted unfits every other set on the vehicle', async () => {
    ;(prisma.tyreSet.findUnique as jest.Mock).mockResolvedValue({ id: 's1', vehicleId: 'v1', createdByUserId: 'owner' })
    const res = await PATCH(req({ isFitted: true }), { params: { id: 'v1', setId: 's1' } })
    expect(res.status).toBe(200)
    expect(prisma.tyreSet.updateMany).toHaveBeenCalledWith({
      where: { vehicleId: 'v1', id: { not: 's1' } },
      data: { isFitted: false },
    })
  })

  it('a collaborator changes and removes only the sets they added', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    ;(prisma.tyreSet.findUnique as jest.Mock).mockResolvedValue({ id: 's1', vehicleId: 'v1', createdByUserId: 'owner' })
    expect((await PATCH(req({ treadDepthMm: 5 }), { params: { id: 'v1', setId: 's1' } })).status).toBe(403)
    expect((await DELETE({} as never, { params: { id: 'v1', setId: 's1' } })).status).toBe(403)
    expect(prisma.tyreSet.delete).not.toHaveBeenCalled()
    // …but can add one of their own.
    expect((await POST(req({ season: 'WINTER' }), { params: { id: 'v1' } })).status).toBe(201)
  })

  it('a set on another vehicle is not found', async () => {
    ;(prisma.tyreSet.findUnique as jest.Mock).mockResolvedValue({ id: 's1', vehicleId: 'other', createdByUserId: 'owner' })
    expect((await DELETE({} as never, { params: { id: 'v1', setId: 's1' } })).status).toBe(404)
  })
})
