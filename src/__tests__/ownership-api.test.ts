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
    projectCollaborator: { findFirst: jest.fn() },
    task: { findMany: jest.fn() },
    foundState: { findUnique: jest.fn(), updateMany: jest.fn() },
    vehicleExpense: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  },
}))

import fs from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/vehicles/[id]/expenses/route'
import { DELETE } from '@/app/api/vehicles/[id]/expenses/[expenseId]/route'
import { GET as vehicleGet, PATCH as vehiclePatch } from '@/app/api/vehicles/[id]/route'

const mockSession = getServerSession as jest.Mock
const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never
const MONEY = {
  purchasePriceRon: new Prisma.Decimal('40000'),
  currentValueRon: new Prisma.Decimal('30000'),
  currentValueAt: new Date('2026-09-01'),
  financeType: 'CREDIT',
  financeMonthlyRon: new Prisma.Decimal('1200'),
  financeStartDate: new Date('2026-01-01'),
  financeEndDate: null,
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
  mockSession.mockResolvedValue({ user: { id: 'owner' } })
  ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ id: 'v1', ownerId: 'owner', projectType: 'DAILY_DRIVER', ...MONEY })
  ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue(null)
  ;(prisma.task.findMany as jest.Mock).mockResolvedValue([])
  ;(prisma.vehicleExpense.create as jest.Mock).mockImplementation(({ data }) =>
    Promise.resolve({ id: 'e1', ...data, amountRon: new Prisma.Decimal(data.amountRon) })
  )
})

describe('expenses', () => {
  it('records one, with the amount as a number', async () => {
    const res = await POST(req({ kind: 'TOLL', amountRon: '15.50', note: 'Fetești' }), { params: { id: 'v1' } })
    expect(res.status).toBe(201)
    expect((await res.json()).amountRon).toBe(15.5)
    expect(prisma.vehicleExpense.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ vehicleId: 'v1', kind: 'TOLL', amountRon: 15.5, note: 'Fetești', createdByUserId: 'owner' }),
    })
  })

  it('names the invalid field', async () => {
    const res = await POST(req({ kind: 'TOLL', amountRon: -3 }), { params: { id: 'v1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/amountRon/)
  })

  it('a collaborator adds costs, and removes only their own', async () => {
    mockSession.mockResolvedValue({ user: { id: 'driver' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    expect((await POST(req({ kind: 'PARKING', amountRon: 10 }), { params: { id: 'v1' } })).status).toBe(201)
    ;(prisma.vehicleExpense.findUnique as jest.Mock).mockResolvedValue({ id: 'e1', vehicleId: 'v1', createdByUserId: 'owner' })
    expect((await DELETE({} as never, { params: { id: 'v1', expenseId: 'e1' } })).status).toBe(403)
    expect(prisma.vehicleExpense.delete).not.toHaveBeenCalled()
  })

  it('an expense on another vehicle is not found', async () => {
    ;(prisma.vehicleExpense.findUnique as jest.Mock).mockResolvedValue({ id: 'e1', vehicleId: 'other', createdByUserId: 'owner' })
    expect((await DELETE({} as never, { params: { id: 'v1', expenseId: 'e1' } })).status).toBe(404)
  })
})

describe('the vehicle’s own money', () => {
  it('reaches the owner as numbers', async () => {
    const data = await (await vehicleGet({} as never, { params: { id: 'v1' } })).json()
    expect(data.vehicle).toMatchObject({ purchasePriceRon: 40000, currentValueRon: 30000, financeMonthlyRon: 1200 })
  })

  it('never reaches a collaborator the owner hides costs from', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({
      id: 'v1', ownerId: 'owner', projectType: 'DAILY_DRIVER', hideCostsFromCollaborators: true, ...MONEY,
    })
    const data = await (await vehicleGet({} as never, { params: { id: 'v1' } })).json()
    for (const field of ['purchasePriceRon', 'currentValueRon', 'currentValueAt', 'financeType', 'financeMonthlyRon', 'financeStartDate']) {
      expect(data.vehicle[field]).toBeNull()
    }
  })

  it('PATCH saves values and finance, and a restoration’s intake keeps its copy in step', async () => {
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({
      id: 'v1', ownerId: 'owner', projectType: 'RESTORATION', slug: 's', ...MONEY, currentValueRon: null,
    })
    ;(prisma.vehicle.update as jest.Mock).mockResolvedValue({ id: 'v1', ...MONEY })
    const res = await vehiclePatch(req({ purchasePriceRon: '12000', purchaseDate: '2024-05-01', currentValueRon: '15000' }), { params: { id: 'v1' } })
    expect(res.status).toBe(200)
    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: expect.objectContaining({ purchasePriceRon: 12000, purchaseDate: new Date('2024-05-01T00:00:00Z'), currentValueRon: 15000, currentValueAt: expect.any(Date) }),
    })
    expect(prisma.foundState.updateMany).toHaveBeenCalledWith({
      where: { vehicleId: 'v1' },
      data: { purchasePriceRon: 12000, acquisitionDate: new Date('2024-05-01T00:00:00Z') },
    })
  })

  it('PATCH refuses a contract that ends before it starts', async () => {
    const res = await vehiclePatch(req({ financeEndDate: '2025-06-01' }), { params: { id: 'v1' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/financeEndDate/)
  })
})

describe('the cost of ownership screen', () => {
  const page = fs.readFileSync(path.join(process.cwd(), 'src/app/dashboard/vehicles/[id]/costs/page.tsx'), 'utf8')

  it('applies the cost rule itself — it is a new aggregate', () => {
    expect(page).toMatch(/if \(hidesCosts\(vehicle\)\)/)
  })

  it('gates the breakdown on the owner’s Pro, not the viewer’s', () => {
    expect(page).toMatch(/where: \{ id: vehicle\.ownerId \}, select: \{ \.\.\.PRO_SELECT \}/)
  })

  it('is never linked from a public surface', () => {
    for (const file of ['src/app/builds/[username]/[slug]/page.tsx', 'src/app/community/page.tsx']) {
      expect(fs.readFileSync(path.join(process.cwd(), file), 'utf8')).not.toMatch(/\/costs\b|ownershipReport/)
    }
  })
})
