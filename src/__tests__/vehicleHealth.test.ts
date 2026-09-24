import fs from 'fs'
import path from 'path'
import { computeHealth, nextAction, parseServiceInterval, type HealthInput } from '@/lib/vehicleHealth'

const NOW = new Date('2026-09-23T12:00:00Z')
const day = (d: string) => new Date(`${d}T00:00:00Z`)

function input(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    vehicleId: 'v1',
    projectType: 'DAILY_DRIVER',
    now: NOW,
    documents: [],
    tasks: [],
    readings: [],
    tyreSets: [],
    ...overrides,
  }
}

const row = (report: ReturnType<typeof computeHealth>, id: string) => report.rows.find((r) => r.id === id)!

describe('silence is not health', () => {
  it('an empty daily driver is all "nothing recorded", never green', () => {
    const report = computeHealth(input())
    expect(report.rows.map((r) => [r.id, r.tone])).toEqual([
      ['documents', 'none'],
      ['service', 'none'],
      ['tyres', 'none'],
      ['jobs', 'none'],
    ])
    expect(report.rows.some((r) => r.tone === 'ok')).toBe(false)
  })

  it('with nothing wrong and nothing recorded, the next action is to record something', () => {
    expect(computeHealth(input()).next?.message.key).toBe('nextAction.addDocuments')
  })
})

describe('documents', () => {
  it('uses the same buckets as the documents board and the reminder emails', () => {
    const report = computeHealth(
      input({
        documents: [
          { id: 'd1', type: 'ITP', expiryDate: day('2026-10-05') }, // 12 days
          { id: 'd2', type: 'RCA', expiryDate: day('2027-03-01') },
          { id: 'd3', type: 'ROVINIETA', expiryDate: day('2026-09-01') },
        ],
      })
    )
    expect(row(report, 'document:ITP')).toMatchObject({ tone: 'warn', reason: { key: 'documents.expiring', values: { days: 12 } } })
    expect(row(report, 'document:RCA').tone).toBe('ok')
    expect(row(report, 'document:ROVINIETA')).toMatchObject({ tone: 'danger', reason: { key: 'documents.expired' } })
  })

  it('judges each type by its latest expiry — a renewal clears the old one', () => {
    const report = computeHealth(
      input({
        documents: [
          { id: 'old', type: 'ITP', expiryDate: day('2025-09-01') },
          { id: 'new', type: 'ITP', expiryDate: day('2027-09-01') },
        ],
      })
    )
    expect(report.rows.filter((r) => r.id === 'document:ITP')).toHaveLength(1)
    expect(row(report, 'document:ITP').tone).toBe('ok')
  })

  it('never alarms about a restoration off the road — its documents are information', () => {
    const report = computeHealth(
      input({ projectType: 'RESTORATION', documents: [{ id: 'd1', type: 'ITP', expiryDate: day('2019-05-01') }] })
    )
    expect(row(report, 'document:ITP')).toMatchObject({ tone: 'info', reason: { key: 'documents.offRoadExpired' } })
    expect(report.rows.some((r) => r.tone === 'danger' || r.tone === 'warn')).toBe(false)
  })

  it('gives a restoration no service row and no tyre row', () => {
    const ids = computeHealth(input({ projectType: 'RESTORATION' })).rows.map((r) => r.id)
    expect(ids).not.toContain('service')
    expect(ids).not.toContain('tyres')
  })
})

describe('service', () => {
  const service = (date: string) => ({ id: 's1', name: 'Revizie', category: 'SERVICING', status: 'DONE', date: day(date) })

  it('counts time alone when there is no distance to measure', () => {
    const report = computeHealth(input({ tasks: [service('2026-03-01')] }))
    expect(row(report, 'service')).toMatchObject({ tone: 'ok', reason: { key: 'service.dueTime' } })
  })

  it('goes amber within a month of the interval, and red past it', () => {
    expect(row(computeHealth(input({ tasks: [service('2025-10-10')] })), 'service').tone).toBe('warn')
    expect(row(computeHealth(input({ tasks: [service('2025-08-01')] })), 'service').tone).toBe('danger')
  })

  it('counts km from a reading on the service day to the latest one', () => {
    const readings = [
      { id: 'r1', km: 100_000, readAt: day('2026-03-01'), isOverride: false },
      { id: 'r2', km: 113_800, readAt: day('2026-09-20'), isOverride: false },
    ]
    const r = row(computeHealth(input({ tasks: [service('2026-03-01')], readings })), 'service')
    expect(r).toMatchObject({ tone: 'warn', reason: { key: 'service.due', values: { km: 1_200 } } })
  })

  it('does not guess distance from a later reading when the service day has none', () => {
    const readings = [
      { id: 'r1', km: 105_000, readAt: day('2026-05-01'), isOverride: false },
      { id: 'r2', km: 110_000, readAt: day('2026-09-20'), isOverride: false },
    ]
    const r = row(computeHealth(input({ tasks: [service('2026-03-01')], readings })), 'service')
    expect(r.reason.key).toBe('service.dueTime')
  })

  it('only counts a completed job in the mode’s service category', () => {
    const tasks = [
      { id: 't1', name: 'Frâne', category: 'BRAKES', status: 'DONE', date: day('2026-09-01') },
      { id: 't2', name: 'Revizie', category: 'SERVICING', status: 'DUE', date: day('2026-09-01') },
    ]
    expect(row(computeHealth(input({ tasks })), 'service').tone).toBe('none')
  })
})

describe('service interval set by the owner (#104)', () => {
  const service = (date: string) => ({ id: 's1', name: 'Revizie', category: 'SERVICING', status: 'DONE', date: day(date) })
  const readings = (from: number, to: number) => [
    { id: 'r1', km: from, readAt: day('2026-03-01'), isOverride: false },
    { id: 'r2', km: to, readAt: day('2026-09-20'), isOverride: false },
  ]
  const health = (o: Partial<HealthInput>) => row(computeHealth(input({ tasks: [service('2026-03-01')], ...o })), 'service')

  it('states the owner’s figure, never the assumption', () => {
    const r = health({ readings: readings(100_000, 104_000), serviceInterval: { km: 10_000, months: 12 } })
    expect(r).toMatchObject({
      tone: 'ok',
      reason: { key: 'service.ownDue', values: { km: 6_000, intervalKm: 10_000, months: 12 } },
    })
  })

  it('counts months on the calendar from the service day', () => {
    // 1 March + 6 months = 1 September, 22 days before NOW.
    const r = health({ serviceInterval: { km: null, months: 6 } })
    expect(r).toMatchObject({ tone: 'danger', reason: { key: 'service.ownOverdueTime', values: { days: 22, months: 6 } } })
  })

  it('does not fill the half the owner left empty from the default', () => {
    // Distance only: 7 months on is past the default year? No — but it would
    // be past a made-up time limit; nothing about time may be said.
    const r = health({ readings: readings(100_000, 120_000), serviceInterval: { km: 30_000, months: null } })
    expect(r).toMatchObject({ tone: 'ok', reason: { key: 'service.ownDueKm', values: { km: 10_000, intervalKm: 30_000 } } })
    expect(r.reason.values).not.toHaveProperty('days')
  })

  it('is unknown, not fine, when a distance-only interval cannot be measured', () => {
    const r = health({ serviceInterval: { km: 30_000, months: null } })
    expect(r).toMatchObject({ tone: 'none', reason: { key: 'service.ownNoDistance' }, action: { key: 'nextAction.recordKm' } })
    expect(r.href).toMatch(/\/odometer$/)
  })

  it('names the distance it cannot measure yet when the interval has both', () => {
    const r = health({ serviceInterval: { km: 10_000, months: 12 } })
    expect(r.reason).toMatchObject({ key: 'service.ownDueTimeKmUnknown', values: { intervalKm: 10_000, months: 12 } })
  })

  it('names only what has run out when it is overdue', () => {
    const r = health({ readings: readings(100_000, 111_000), serviceInterval: { km: 10_000, months: 12 } })
    expect(r).toMatchObject({ tone: 'danger', reason: { key: 'service.ownOverdueKm', values: { km: 1_000 } } })
  })

  it('falls back to the default, said to be assumed, with nothing set', () => {
    expect(health({ serviceInterval: { km: null, months: null } }).reason.key).toBe('service.dueTime')
    expect(health({ readings: readings(100_000, 116_000) }).reason).toMatchObject({ key: 'service.overdueKm', values: { km: 1_000 } })
  })

  it('gives a restoration no service row whatever is set', () => {
    const ids = computeHealth(input({ projectType: 'RESTORATION', serviceInterval: { km: 5_000, months: 6 } })).rows.map((r) => r.id)
    expect(ids).not.toContain('service')
  })
})

describe('parseServiceInterval', () => {
  it('reads only the fields sent, and clears on empty', () => {
    expect(parseServiceInterval({})).toEqual({ ok: true, data: {} })
    expect(parseServiceInterval({ serviceIntervalKm: '10000', serviceIntervalMonths: '' })).toEqual({
      ok: true,
      data: { serviceIntervalKm: 10_000, serviceIntervalMonths: null },
    })
  })

  it.each([
    [{ serviceIntervalKm: 100 }, 'serviceIntervalKm'],
    [{ serviceIntervalKm: 12_500.5 }, 'serviceIntervalKm'],
    [{ serviceIntervalMonths: 0 }, 'serviceIntervalMonths'],
    [{ serviceIntervalMonths: 'soon' }, 'serviceIntervalMonths'],
  ])('refuses %j', (body, field) => {
    expect(parseServiceInterval(body)).toEqual({ ok: false, field })
  })
})

describe('tyres', () => {
  const set = (o: Partial<HealthInput['tyreSets'][number]>) => ({
    id: 't', isFitted: true, treadDepthMm: null, dotYear: null, fittedAt: null, fittedKm: null, ...o,
  })

  it.each([
    [{ treadDepthMm: 1.4 }, 'danger', 'tyres.belowLegal'],
    [{ treadDepthMm: 2.5 }, 'warn', 'tyres.wearing'],
    [{ treadDepthMm: 6 }, 'ok', 'tyres.okTread'],
    [{ dotYear: 2014 }, 'danger', 'tyres.tooOld'],
    [{ dotYear: 2019 }, 'warn', 'tyres.ageing'],
    [{}, 'none', 'tyres.noMeasure'],
  ])('fitted set %j → %s', (o, tone, key) => {
    expect(row(computeHealth(input({ tyreSets: [set(o)] })), 'tyres')).toMatchObject({ tone, reason: { key } })
  })

  it('says so when sets exist but none is marked fitted', () => {
    const r = row(computeHealth(input({ tyreSets: [set({ isFitted: false, treadDepthMm: 7 })] })), 'tyres')
    expect(r).toMatchObject({ tone: 'none', reason: { key: 'tyres.noneFitted' } })
  })
})

describe('open jobs', () => {
  it('a broken part on a build is red and becomes the next action', () => {
    const tasks = [{ id: 'b', name: 'Winch', category: 'RECOVERY', status: 'BROKEN', date: day('2026-09-01') }]
    const report = computeHealth(input({ projectType: 'OFFROAD', tasks }))
    expect(row(report, 'jobs').tone).toBe('danger')
  })

  it('planned build work is information, not a problem', () => {
    const tasks = [{ id: 'p', name: 'Lift kit', category: 'SUSPENSION', status: 'PLANNED', date: day('2026-10-01') }]
    expect(row(computeHealth(input({ projectType: 'OFFROAD', tasks })), 'jobs').tone).toBe('info')
  })

  it('due daily-driver work is amber once its date has come', () => {
    const tasks = [{ id: 'd', name: 'Plăcuțe', category: 'BRAKES', status: 'DUE', date: day('2026-09-10') }]
    expect(row(computeHealth(input({ tasks })), 'jobs').tone).toBe('warn')
  })
})

describe('the next action', () => {
  it('is one answer: the most urgent red before any amber', () => {
    const report = computeHealth(
      input({
        documents: [
          { id: 'd1', type: 'ITP', expiryDate: day('2026-10-05') }, // amber
          { id: 'd2', type: 'RCA', expiryDate: day('2026-09-20') }, // red
          { id: 'd3', type: 'ROVINIETA', expiryDate: day('2026-09-01') }, // red, older
        ],
      })
    )
    expect(report.next).toEqual({
      message: { key: 'nextAction.renew', values: { type: 'ROVINIETA' } },
      href: '/dashboard/vehicles/v1/documents',
    })
  })

  it('is nothing at all when everything is recorded and fine — no false reassurance', () => {
    expect(
      nextAction([
        { area: 'jobs', id: 'jobs', label: { key: 'x' }, tone: 'ok', reason: { key: 'y' }, href: '/', urgency: 0 },
      ])
    ).toBeNull()
  })
})

describe('it is never a rating', () => {
  it('produces no score, grade or percentage anywhere', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/vehicleHealth.ts'), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/\b(score|grade|rating|percent)\b/i)
  })
})

describe('every message it can produce is translated', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/lib/vehicleHealth.ts'), 'utf8')
  // Every quoted string that looks like a key, not only `key: '…'` — a key
  // picked by a ternary was invisible to that, which is how the tyre row
  // shipped `next.tyres`, a key neither catalogue has.
  const keys = Array.from(
    source.matchAll(/'((?:area|doc|documents|service|tyres|jobs|next|nextAction)\.[a-zA-Z.]+)'/g),
    (m) => m[1]
  )
  const lookup = (obj: unknown, dotted: string) =>
    dotted.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), obj)

  it.each(['en', 'ro'])('%s has every health key', (locale) => {
    const catalogue = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8')).health
    expect(keys.length).toBeGreaterThan(20)
    for (const key of keys) expect({ key, value: typeof lookup(catalogue, key) }).toEqual({ key, value: 'string' })
    for (const type of ['ITP', 'RCA', 'CASCO', 'ROVINIETA', 'FIRST_AID_KIT', 'FIRE_EXTINGUISHER', 'VIGNETTE']) {
      expect(typeof lookup(catalogue, `doc.${type}`)).toBe('string')
    }
  })

})
