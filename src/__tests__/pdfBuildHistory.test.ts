import { buildVehicleHistoryDocDefinition, type VehicleHistoryPdfInput } from '@/lib/pdfBuildHistory'

const BASE_INPUT: VehicleHistoryPdfInput = {
  vehicleName: '2001 Jeep Wrangler',
  projectType: 'OFFROAD',
  generation: 'TJ',
  engine: '4.0L I6',
  vin: '1J4FA49S31P123456',
  coverPhotoDataUri: null,
  progressLabel: 'Build progress',
  progressPct: 42,
  totalSpent: 12500,
  categories: [
    {
      categoryLabel: 'Suspension',
      tasks: [
        {
          name: 'Lift kit',
          brand: 'Rubicon Express',
          statusLabel: 'Done',
          workType: 'DIY',
          date: new Date('2024-03-01'),
          totalCost: 3500,
          workshopName: null,
          notes: null,
          photos: [],
        },
      ],
    },
  ],
  foundState: null,
  generatedAt: new Date('2024-06-01'),
}

describe('buildVehicleHistoryDocDefinition', () => {
  it('includes the vehicle name and progress summary', () => {
    const doc = buildVehicleHistoryDocDefinition(BASE_INPUT)
    const content = doc.content as Record<string, unknown>[]
    expect(content[0]).toMatchObject({ text: '2001 Jeep Wrangler' })
  })

  it('omits the found state section for an off-road vehicle', () => {
    const doc = buildVehicleHistoryDocDefinition(BASE_INPUT)
    const content = JSON.stringify(doc.content)
    expect(content).not.toContain('Found state')
  })

  it('includes a found state section for a restoration vehicle when populated', () => {
    const doc = buildVehicleHistoryDocDefinition({
      ...BASE_INPUT,
      projectType: 'RESTORATION',
      foundState: {
        acquisitionDate: new Date('2020-01-01'),
        purchasePriceRon: 15000,
        odometer: 120000,
        knownHistory: 'Barn find, one owner.',
        conditionRating: 3,
        photos: [],
      },
    })
    const content = JSON.stringify(doc.content)
    expect(content).toContain('Found state')
    expect(content).toContain('Barn find, one owner.')
  })

  it('skips categories with no tasks', () => {
    const doc = buildVehicleHistoryDocDefinition({
      ...BASE_INPUT,
      categories: [
        { categoryLabel: 'Suspension', tasks: BASE_INPUT.categories[0].tasks },
        { categoryLabel: 'Empty category', tasks: [] },
      ],
    })
    const content = JSON.stringify(doc.content)
    expect(content).not.toContain('Empty category')
  })

  it('renders task cost formatted as RON', () => {
    const doc = buildVehicleHistoryDocDefinition(BASE_INPUT)
    const content = JSON.stringify(doc.content)
    expect(content).toContain('3.500 RON')
  })

  it('embeds up to the photos passed in as image nodes', () => {
    const doc = buildVehicleHistoryDocDefinition({
      ...BASE_INPUT,
      categories: [
        {
          categoryLabel: 'Suspension',
          tasks: [
            {
              ...BASE_INPUT.categories[0].tasks[0],
              photos: [{ dataUri: 'data:image/jpeg;base64,AAA', caption: null }],
            },
          ],
        },
      ],
    })
    const content = JSON.stringify(doc.content)
    expect(content).toContain('data:image/jpeg;base64,AAA')
  })

  it('provides a footer function that renders page numbers', () => {
    const doc = buildVehicleHistoryDocDefinition(BASE_INPUT)
    expect(typeof doc.footer).toBe('function')
    const footer = doc.footer as (p: number, c: number) => unknown
    expect(JSON.stringify(footer(2, 5))).toContain('2 / 5')
  })
})
