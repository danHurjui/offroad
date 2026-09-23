import fs from 'fs'
import path from 'path'
import {
  COST_CATEGORIES,
  MONEY_COLUMNS,
  archivedDocumentCost,
  costLines,
  financePayments,
  ownershipReport,
  parseCostPaid,
  parseExpense,
  parseValues,
  type CostSource,
  type OwnershipInput,
} from '@/lib/ownershipCosts'

const NOW = new Date('2026-09-23T12:00:00Z')
const day = (d: string) => new Date(`${d}T00:00:00Z`)

function input(overrides: Partial<OwnershipInput> = {}, vehicle: Partial<OwnershipInput['vehicle']> = {}): OwnershipInput {
  return {
    vehicleId: 'v1',
    projectType: 'DAILY_DRIVER',
    now: NOW,
    vehicle: {
      createdAt: day('2025-01-01'),
      purchaseDate: null,
      purchasePriceRon: null,
      currentValueRon: null,
      currentValueAt: null,
      financeType: null,
      financeMonthlyRon: null,
      financeStartDate: null,
      financeEndDate: null,
      ...vehicle,
    },
    tasks: [],
    fuel: [],
    documents: [],
    tyreSets: [],
    expenses: [],
    readings: [],
    ...overrides,
  }
}

const reading = (id: string, km: number, d: string, isOverride = false) => ({ id, km, readAt: day(d), isOverride })

describe('every money column is decided about', () => {
  // The invariant the plan on #49 asks for: a new cost column cannot be
  // added to the schema and silently left out of the total.
  const schema = fs.readFileSync(path.join(process.cwd(), 'prisma/schema.prisma'), 'utf8')
  const columns: string[] = []
  for (const model of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    for (const field of model[2].matchAll(/^\s+(\w+(?:Ron|Bani))\s/gm)) columns.push(`${model[1]}.${field[1]}`)
  }

  it('finds the money columns', () => {
    expect(columns).toEqual(expect.arrayContaining(['Task.costRon', 'FuelEntry.totalRon', 'VehicleExpense.amountRon']))
  })

  it.each(columns)('%s is counted or excluded with a reason', (column) => {
    expect(MONEY_COLUMNS[column]).toBeDefined()
  })

  it('lists nothing that is no longer in the schema', () => {
    expect(Object.keys(MONEY_COLUMNS).sort()).toEqual([...columns].sort())
  })

  it('every counted source actually produces a cost line', () => {
    const counted = new Set(Object.values(MONEY_COLUMNS).filter((v): v is CostSource => typeof v === 'string'))
    const lines = costLines(
      input(
        {
          tasks: [{ id: 't', name: 'Revizie', category: 'SERVICING', date: day('2026-01-10'), workType: 'DIY', costRon: 300, partsCostRon: null, labourCostRon: null }],
          fuel: [{ id: 'f', date: day('2026-02-01'), totalRon: 350, station: null }],
          documents: [{ id: 'd', type: 'RCA', costRon: 900, paidAt: day('2026-03-01'), createdAt: day('2026-03-01') }],
          tyreSets: [{ id: 's', season: 'WINTER', label: null, costRon: 1600, purchasedAt: day('2025-11-01'), fittedAt: null, createdAt: day('2025-11-01') }],
          expenses: [{ id: 'e', date: day('2026-04-01'), kind: 'TAX', amountRon: 120, note: null }],
        },
        { purchasePriceRon: 40000, purchaseDate: day('2025-01-01'), financeType: 'LEASING', financeMonthlyRon: 500, financeStartDate: day('2026-08-01') }
      )
    )
    expect(new Set(lines.map((l) => l.source))).toEqual(counted)
  })
})

describe('the total', () => {
  it('uses the same task arithmetic as analytics — parts plus labour for a workshop job', () => {
    const report = ownershipReport(
      input({
        tasks: [{ id: 't', name: 'Ambreiaj', category: 'CLUTCH', date: day('2026-05-01'), workType: 'WORKSHOP', costRon: 999, partsCostRon: 800, labourCostRon: 400 }],
      }),
      'all'
    )
    expect(report.total).toBe(1200)
  })

  it('puts each source in its category, documents by type', () => {
    const report = ownershipReport(
      input({
        documents: [
          { id: 'a', type: 'RCA', costRon: 900, paidAt: day('2026-03-01'), createdAt: day('2026-03-01') },
          { id: 'b', type: 'ITP', costRon: 180, paidAt: day('2026-03-02'), createdAt: day('2026-03-02') },
          { id: 'c', type: 'ROVINIETA', costRon: 140, paidAt: day('2026-03-03'), createdAt: day('2026-03-03') },
          { id: 'd', type: 'FIRST_AID_KIT', costRon: 40, paidAt: day('2026-03-04'), createdAt: day('2026-03-04') },
        ],
        expenses: [{ id: 'e', date: day('2026-04-01'), kind: 'TOLL', amountRon: 15, note: 'Fetești' }],
      }),
      'all'
    )
    const total = (c: string) => report.categories.find((x) => x.category === c)!.total
    expect(total('insurance')).toBe(900)
    expect(total('inspection')).toBe(180)
    expect(total('roadCharges')).toBe(155)
    expect(total('other')).toBe(40)
    expect(report.categories.map((c) => c.category)).toEqual([...COST_CATEGORIES])
  })

  it('never counts the value estimate — depreciation is not a cost line', () => {
    const report = ownershipReport(input({}, { purchasePriceRon: 40000, purchaseDate: day('2025-01-01'), currentValueRon: 30000, currentValueAt: day('2026-09-01') }), 'all')
    expect(report.total).toBe(40000)
    expect(report.value).toEqual({ currentValueRon: 30000, at: day('2026-09-01'), purchasePriceRon: 40000 })
  })

  it('a period keeps only what was paid inside it, and never starts before the purchase', () => {
    const tasks = [
      { id: 'old', name: 'x', category: 'X', date: day('2025-03-01'), workType: 'DIY' as const, costRon: 100, partsCostRon: null, labourCostRon: null },
      { id: 'new', name: 'y', category: 'X', date: day('2026-06-01'), workType: 'DIY' as const, costRon: 50, partsCostRon: null, labourCostRon: null },
    ]
    const year = ownershipReport(input({ tasks }), '12m')
    expect(year.total).toBe(50)
    const recent = ownershipReport(input({ tasks }, { purchaseDate: day('2026-08-01') }), '12m')
    expect(recent.from).toEqual(day('2026-08-01'))
  })

  it('every line links to the entry behind it', () => {
    const lines = costLines(
      input({ tasks: [{ id: 't9', name: 'x', category: 'X', date: day('2026-01-01'), workType: 'DIY', costRon: 1, partsCostRon: null, labourCostRon: null }] })
    )
    expect(lines[0].href).toBe('/dashboard/vehicles/v1/tasks/t9')
  })
})

describe('finance', () => {
  const v = (o: Partial<OwnershipInput['vehicle']>) => input({}, o).vehicle

  it('counts one payment a month up to today, none in the future', () => {
    const dates = financePayments(v({ financeType: 'LEASING', financeMonthlyRon: 500, financeStartDate: day('2026-06-15') }), NOW)
    expect(dates).toEqual([day('2026-06-15'), day('2026-07-15'), day('2026-08-15'), day('2026-09-15')])
  })

  it('stops at the end of the contract, and keeps the 31st at month end', () => {
    const dates = financePayments(
      v({ financeType: 'CREDIT', financeMonthlyRon: 500, financeStartDate: day('2026-01-31'), financeEndDate: day('2026-04-30') }),
      NOW
    )
    expect(dates).toEqual([day('2026-01-31'), day('2026-02-28'), day('2026-03-31'), day('2026-04-30')])
  })

  it('counts nothing once the finance type is switched off', () => {
    expect(financePayments(v({ financeType: null, financeMonthlyRon: 500, financeStartDate: day('2026-01-01') }), NOW)).toEqual([])
  })

  it('warns when a loan and a full purchase price would count the car twice', () => {
    const report = ownershipReport(
      input({}, { purchasePriceRon: 60000, financeType: 'CREDIT', financeMonthlyRon: 1200, financeStartDate: day('2026-01-10') }),
      'all'
    )
    expect(report.coverage.map((c) => c.key)).toContain('coverage.creditAndPurchase')
  })
})

describe('cost per km', () => {
  it('is measured only over the stretch the readings cover, with the costs paid inside it', () => {
    const report = ownershipReport(
      input({
        readings: [reading('a', 100_000, '2026-06-01'), reading('b', 102_000, '2026-08-01')],
        fuel: [
          { id: 'before', date: day('2026-05-01'), totalRon: 400, station: null }, // before the stretch
          { id: 'start', date: day('2026-06-01'), totalRon: 300, station: null }, // burnt in it
          { id: 'mid', date: day('2026-07-01'), totalRon: 300, station: null },
          { id: 'end', date: day('2026-08-01'), totalRon: 300, station: null }, // burnt after it
        ],
      }),
      'all'
    )
    expect(report.perKm).toEqual({ value: 0.3, km: 2000, costs: 600, from: day('2026-06-01'), to: day('2026-08-01') })
  })

  it('excludes the purchase — it is not a running cost', () => {
    const report = ownershipReport(
      input({ readings: [reading('a', 1000, '2026-06-01'), reading('b', 2000, '2026-08-01')] }, { purchasePriceRon: 50000, purchaseDate: day('2026-06-01') }),
      'all'
    )
    expect(report.perKm?.costs).toBe(0)
  })

  it('refuses to invent one from a single reading', () => {
    const report = ownershipReport(input({ readings: [reading('a', 1000, '2026-06-01')] }), 'all')
    expect(report.perKm).toBeNull()
    expect(report.perKmMissing).toEqual({ key: 'perKm.fewReadings' })
  })

  it('does not measure across a replaced cluster', () => {
    const report = ownershipReport(
      input({ readings: [reading('a', 200_000, '2026-06-01'), reading('b', 10, '2026-07-01', true), reading('c', 510, '2026-08-01')] }),
      'all'
    )
    expect(report.perKm?.km).toBe(500)
  })
})

describe('it says what it does not know', () => {
  it('an empty vehicle has no total to trust and says why', () => {
    const report = ownershipReport(input(), 'all')
    expect(report.total).toBe(0)
    expect(report.coverage.map((c) => c.key)).toEqual(['coverage.noPurchase', 'coverage.noFuel'])
  })

  it('names when fuel only covers part of the period', () => {
    const report = ownershipReport(
      input({ fuel: [{ id: 'f', date: day('2026-07-01'), totalRon: 300, station: null }] }, { purchaseDate: day('2024-01-01'), purchasePriceRon: 1 }),
      'all'
    )
    expect(report.coverage).toContainEqual({ key: 'coverage.fuelSince', values: { date: '2026-07-01' } })
  })

  it('names when the km only cover part of the period', () => {
    const report = ownershipReport(
      input({ readings: [reading('a', 1000, '2026-08-01'), reading('b', 2000, '2026-09-01')] }, { purchaseDate: day('2025-01-01'), purchasePriceRon: 1 }),
      'all'
    )
    expect(report.coverage.find((c) => c.key === 'coverage.kmWindow')?.values).toMatchObject({ from: '2026-08-01', to: '2026-09-01', days: 31 })
  })

  it('counts documents with no price', () => {
    const report = ownershipReport(
      input({ documents: [{ id: 'd', type: 'ITP', costRon: null, paidAt: null, createdAt: day('2026-01-01') }] }),
      'all'
    )
    expect(report.coverage).toContainEqual({ key: 'coverage.documentsWithoutPrice', values: { count: 1 } })
  })

  it('does not nag a restoration about fuel', () => {
    const report = ownershipReport(input({ projectType: 'RESTORATION' }), 'all')
    expect(report.coverage.map((c) => c.key)).not.toContain('coverage.noFuel')
  })
})

describe('parsing', () => {
  const current = { financeStartDate: null, financeEndDate: null, currentValueRon: null }

  it('stamps a new value estimate with today, and leaves an unchanged one alone', () => {
    expect(parseValues({ currentValueRon: '30000' }, current, NOW)).toEqual({
      ok: true,
      data: { currentValueRon: 30000, currentValueAt: day('2026-09-23') },
    })
    expect(parseValues({ currentValueRon: '30000' }, { ...current, currentValueRon: 30000 }, NOW)).toEqual({
      ok: true,
      data: { currentValueRon: 30000 },
    })
  })

  it.each([
    [{ purchaseDate: '2999-01-01' }, 'purchaseDate'],
    [{ purchasePriceRon: '-1' }, 'purchasePriceRon'],
    [{ financeType: 'LOAN' }, 'financeType'],
    [{ financeStartDate: '2026-05-01', financeEndDate: '2026-04-01' }, 'financeEndDate'],
  ])('refuses %j', (body, field) => {
    expect(parseValues(body, current, NOW)).toEqual({ ok: false, field })
  })

  it('accepts a contract that ends in the future', () => {
    expect(parseValues({ financeStartDate: '2026-01-01', financeEndDate: '2030-01-01' }, current, NOW).ok).toBe(true)
  })

  it('dates a new price today, but never replaces an existing date on an edit', () => {
    expect(parseCostPaid({ costRon: '900' }, 'paidAt', null, NOW)).toEqual({ ok: true, data: { costRon: 900, paidAt: day('2026-09-23') } })
    expect(parseCostPaid({ costRon: '950' }, 'paidAt', day('2026-03-01'), NOW)).toEqual({ ok: true, data: { costRon: 950 } })
    expect(parseCostPaid({ costRon: 'abc' }, 'purchasedAt', null, NOW)).toEqual({ ok: false, field: 'costRon' })
  })

  it('an expense needs a kind and a positive amount, and defaults to today', () => {
    expect(parseExpense({ kind: 'TOLL', amountRon: '15,5' }, NOW)).toEqual({
      ok: true,
      data: { kind: 'TOLL', amountRon: 15.5, date: day('2026-09-23'), note: null },
    })
    expect(parseExpense({ kind: 'BRIBE', amountRon: 5 }, NOW)).toEqual({ ok: false, field: 'kind' })
    expect(parseExpense({ kind: 'TAX', amountRon: 0 }, NOW)).toEqual({ ok: false, field: 'amountRon' })
    expect(parseExpense({ kind: 'TAX', amountRon: 5, date: '2999-01-01' }, NOW)).toEqual({ ok: false, field: 'date' })
  })
})

describe('renewing a document keeps last period’s price', () => {
  it('as an expense in the same category', () => {
    expect(archivedDocumentCost({ type: 'RCA', costRon: 900, paidAt: day('2025-09-01'), createdAt: day('2025-08-01') })).toEqual({
      date: day('2025-09-01'),
      kind: 'INSURANCE',
      amountRon: 900,
      note: 'RCA',
    })
    expect(archivedDocumentCost({ type: 'ITP', costRon: null, paidAt: null, createdAt: day('2025-08-01') })).toBeNull()
  })
})

describe('safe to import from a client component', () => {
  // tyres.ts (imported by TyreSetForm) reaches this module; anything here
  // that imports apiError/amounts drags request headers into the browser
  // bundle and fails the production build, not the tests.
  it.each(['src/lib/ownershipCosts.ts', 'src/lib/costKinds.ts', 'src/lib/tyres.ts'])('%s imports nothing server-only', (file) => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    expect(source).not.toMatch(/from '\.\/(amounts|apiError|prisma)'|next\/server|next\/headers/)
  })
})
