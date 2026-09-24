jest.mock('@/lib/prisma', () => {
  const m = () => ({ findMany: jest.fn().mockResolvedValue([]) })
  return { prisma: { task: m(), fuelEntry: m(), chargeEntry: m(), document: m(), tyreSet: m(), vehicleExpense: m(), odometerReading: m() } }
})

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { loadOwnershipInputs } from '@/lib/ownershipRecords'

const vehicle = (id: string) => ({
  id,
  projectType: 'DAILY_DRIVER' as const,
  createdAt: new Date('2026-01-01'),
  purchaseDate: null,
  purchasePriceRon: new Prisma.Decimal('1000.50'),
  currentValueRon: null,
  currentValueAt: null,
  financeType: null,
  financeMonthlyRon: null,
  financeStartDate: null,
  financeEndDate: null,
  fuelType: null,
})
const models = ['task', 'fuelEntry', 'chargeEntry', 'document', 'tyreSet', 'vehicleExpense', 'odometerReading'] as const
const findMany = (model: (typeof models)[number]) => (prisma[model] as unknown as { findMany: jest.Mock }).findMany

describe('loadOwnershipInputs', () => {
  beforeEach(() => jest.clearAllMocks())

  /** A fleet page must not become a query per vehicle. */
  it('seven queries for any number of vehicles', async () => {
    await loadOwnershipInputs([vehicle('a'), vehicle('b'), vehicle('c')], new Date())
    for (const model of models) {
      expect(findMany(model)).toHaveBeenCalledTimes(1)
      expect(findMany(model).mock.calls[0][0].where).toEqual({ vehicleId: { in: ['a', 'b', 'c'] } })
    }
  })

  it('hands each vehicle its own rows, with money as numbers', async () => {
    findMany('fuelEntry').mockResolvedValue([
      { id: 'f1', vehicleId: 'a', date: new Date(), totalRon: new Prisma.Decimal('250.25'), station: null },
      { id: 'f2', vehicleId: 'b', date: new Date(), totalRon: new Prisma.Decimal('10'), station: null },
    ])
    const inputs = await loadOwnershipInputs([vehicle('a'), vehicle('b')], new Date())
    expect(inputs.get('a')!.fuel.map((f) => f.totalRon)).toEqual([250.25])
    expect(inputs.get('b')!.fuel.map((f) => f.totalRon)).toEqual([10])
    expect(inputs.get('a')!.vehicle.purchasePriceRon).toBe(1000.5)
  })

  it('no vehicles, no queries', async () => {
    expect((await loadOwnershipInputs([], new Date())).size).toBe(0)
    for (const model of models) expect(findMany(model)).not.toHaveBeenCalled()
  })
})
