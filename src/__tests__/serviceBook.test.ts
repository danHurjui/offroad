import fs from 'fs'
import path from 'path'
import { serviceBook, type ServiceTaskLike } from '@/lib/serviceBook'
import { buildServiceBookDocDefinition } from '@/lib/pdfServiceBook'

const day = (d: string) => new Date(`${d}T00:00:00Z`)

function job(o: Partial<ServiceTaskLike> & { id: string; date: Date }): ServiceTaskLike {
  return {
    name: `job ${o.id}`,
    status: 'DONE',
    category: 'SERVICING',
    workType: 'DIY',
    costRon: null,
    partsCostRon: null,
    labourCostRon: null,
    brand: null,
    notes: null,
    workshopName: null,
    receiptUrl: null,
    createdAt: o.date,
    photoCount: 0,
    km: null,
    ...o,
  }
}

describe('serviceBook', () => {
  it('is a view of completed jobs only, in the order they were done', () => {
    const book = serviceBook(
      [
        job({ id: 'b', date: day('2026-07-08'), km: 130_400 }),
        job({ id: 'planned', date: day('2026-10-01'), status: 'DUE' }),
        job({ id: 'a', date: day('2026-03-12'), km: 124_200 }),
      ],
      'DONE'
    )
    expect(book.rows.map((r) => r.taskId)).toEqual(['a', 'b'])
    expect(book.withKm).toBe(2)
  })

  it('costs a job the way everything else does — parts plus labour at a workshop', () => {
    const book = serviceBook(
      [job({ id: 'w', date: day('2026-03-12'), workType: 'WORKSHOP', partsCostRon: 600, labourCostRon: 250, costRon: 9999, workshopName: 'Auto Service SRL' })],
      'DONE'
    )
    expect(book.rows[0]).toMatchObject({ cost: 850, workshop: 'Auto Service SRL' })
    expect(book.total).toBe(850)
  })

  it('never names a workshop on a DIY job', () => {
    const book = serviceBook([job({ id: 'd', date: day('2026-03-12'), workshopName: 'left over' })], 'DONE')
    expect(book.rows[0].workshop).toBeNull()
  })

  it('orders same-day jobs by km', () => {
    const book = serviceBook(
      [job({ id: 'later', date: day('2026-03-12'), km: 124_300 }), job({ id: 'first', date: day('2026-03-12'), km: 124_200 })],
      'DONE'
    )
    expect(book.rows.map((r) => r.taskId)).toEqual(['first', 'later'])
  })

  it('says so when a job was logged well after it was done', () => {
    const book = serviceBook([job({ id: 'x', date: day('2026-01-10'), createdAt: day('2026-06-01') })], 'DONE')
    expect(book.rows[0].flags).toEqual([{ kind: 'loggedLate', loggedOn: day('2026-06-01') }])
  })

  it('marks where a replaced cluster restarts the km, instead of reordering', () => {
    const book = serviceBook(
      [job({ id: 'old', date: day('2026-01-10'), km: 250_000 }), job({ id: 'new', date: day('2026-05-10'), km: 1_200 })],
      'DONE',
      [{ readAt: day('2026-03-01'), overrideReason: 'CLUSTER_REPLACED' }]
    )
    expect(book.rows.map((r) => r.taskId)).toEqual(['old', 'new'])
    expect(book.rows[1].flags).toEqual([{ kind: 'odometerReset', reason: 'CLUSTER_REPLACED' }])
  })

  it('flags, rather than hides, a km lower than an earlier entry with no reset between', () => {
    const book = serviceBook(
      [job({ id: 'a', date: day('2026-01-10'), km: 130_000 }), job({ id: 'b', date: day('2026-05-10'), km: 129_000 })],
      'DONE'
    )
    expect(book.rows[1].flags).toEqual([{ kind: 'kmBelowEarlier', earlierKm: 130_000 }])
  })
})

describe('the PDF', () => {
  const strings = {
    title: 'Service book',
    entries: 'Entries',
    total: 'Total',
    generated: 'Generated',
    columns: { date: 'DATE', km: 'KM', work: 'WORK', cost: 'COST' },
    provenance: 'A record kept by the owner in RigLog.',
    noEntries: 'none',
    documentedWith: 'RigLog',
    detail: () => 'detail',
    notes: () => '',
  }

  it('says on its face that the owner kept it', () => {
    const doc = buildServiceBookDocDefinition({ strings, vehicleName: 'Dacia Duster', rows: [], total: 0, generatedAt: day('2026-09-23') })
    expect(JSON.stringify(doc.content)).toContain('A record kept by the owner in RigLog.')
  })

  it('is one table row per entry, with Romanian diacritics intact', () => {
    const rows = serviceBook([job({ id: 'a', date: day('2026-03-12'), name: 'Schimb ulei și filtre', km: 124_200, costRon: 850 })], 'DONE').rows
    const doc = buildServiceBookDocDefinition({ strings, vehicleName: 'Dacia', rows, total: 850, generatedAt: day('2026-09-23') })
    const table = (doc.content as Array<{ table?: { body: unknown[] } }>).find((c) => c.table)!
    expect(table.table!.body).toHaveLength(2)
    expect(JSON.stringify(table)).toContain('Schimb ulei și filtre')
  })
})

describe('wiring', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')

  it('the export is the owner’s and Pro, like RL-014', () => {
    const route = read('src/app/api/vehicles/[id]/export/service-book/route.ts')
    expect(route).toMatch(/requireVehicleOwner/)
    expect(route).toMatch(/hasPro\(owner\)/)
  })

  it('the page and the PDF read the same jobs', () => {
    expect(read('src/app/dashboard/vehicles/[id]/service-book/page.tsx')).toMatch(/loadServiceBook\(/)
    expect(read('src/app/api/vehicles/[id]/export/service-book/route.ts')).toMatch(/loadServiceBook\(/)
  })

  it('hides costs from a collaborator the owner hides them from', () => {
    expect(read('src/app/dashboard/vehicles/[id]/service-book/page.tsx')).toMatch(/!isOwner && vehicle\.hideCostsFromCollaborators/)
  })
})
