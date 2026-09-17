import { spendByVehicle } from '@/lib/analytics'

type Over = Partial<{
  costRon: number | null
  partsCostRon: number | null
  labourCostRon: number | null
  workType: 'DIY' | 'WORKSHOP'
}>

const task = (vehicleId: string, over: Over = {}) => ({
  vehicleId,
  category: 'SUSPENSION',
  date: new Date('2026-01-01'),
  workType: 'DIY' as 'DIY' | 'WORKSHOP',
  costRon: null,
  partsCostRon: null,
  labourCostRon: null,
  ...over,
})

describe('spendByVehicle', () => {
  const vehicles = [
    { id: 'v1', label: '1990 Suzuki Samurai' },
    { id: 'v2', label: '2015 Dacia Logan' },
  ]

  it('totals each vehicle and sorts by spend', () => {
    const rows = spendByVehicle(vehicles, [
      task('v1', { costRon: 300 }),
      task('v2', { costRon: 1000 }),
      task('v1', { costRon: 200 }),
    ])
    expect(rows).toEqual([
      { vehicleId: 'v2', label: '2015 Dacia Logan', total: 1000 },
      { vehicleId: 'v1', label: '1990 Suzuki Samurai', total: 500 },
    ])
  })

  it('counts a workshop job as parts plus labour', () => {
    // The same rule the per-vehicle page uses; a garage total that
    // disagreed with the vehicle it came from would be worse than none.
    const rows = spendByVehicle([vehicles[0]], [
      task('v1', { workType: 'WORKSHOP', partsCostRon: 400, labourCostRon: 350 }),
    ])
    expect(rows[0].total).toBe(750)
  })

  it('keeps a vehicle you have not spent anything on', () => {
    const rows = spendByVehicle(vehicles, [task('v1', { costRon: 100 })])
    expect(rows.map((r) => r.vehicleId)).toEqual(['v1', 'v2'])
    expect(rows[1].total).toBe(0)
  })

  it('ignores a task belonging to a vehicle outside the garage', () => {
    // Collaborations are somebody else's spend.
    const rows = spendByVehicle(vehicles, [task('v1', { costRon: 100 }), task('someone-elses', { costRon: 9999 })])
    expect(rows.reduce((sum, r) => sum + r.total, 0)).toBe(100)
  })

  it('handles an empty garage', () => {
    expect(spendByVehicle([], [])).toEqual([])
  })
})
