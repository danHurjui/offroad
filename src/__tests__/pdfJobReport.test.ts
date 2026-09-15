import { buildJobReportDocDefinition, type JobReportInput } from '@/lib/pdfJobReport'

const BASE_INPUT: JobReportInput = {
  collaboratorName: "Bob's Off-Road Garage",
  vehicleName: '2001 Jeep Wrangler',
  rangeLabel: 'Last 30 days',
  tasks: [
    {
      name: 'Diff service',
      category: 'Engine / Drivetrain',
      date: new Date('2024-05-01'),
      workType: 'WORKSHOP',
      partsCostRon: 200,
      labourCostRon: 300,
      photos: [],
    },
  ],
  generatedAt: new Date('2024-06-01'),
}

describe('buildJobReportDocDefinition', () => {
  it('includes the collaborator name and vehicle name', () => {
    const doc = buildJobReportDocDefinition(BASE_INPUT)
    const content = JSON.stringify(doc.content)
    expect(content).toContain("Bob's Off-Road Garage")
    expect(content).toContain('2001 Jeep Wrangler')
  })

  it('sums labour and parts cost separately across tasks', () => {
    const doc = buildJobReportDocDefinition({
      ...BASE_INPUT,
      tasks: [
        { ...BASE_INPUT.tasks[0], partsCostRon: 200, labourCostRon: 300 },
        { ...BASE_INPUT.tasks[0], name: 'Oil change', partsCostRon: 50, labourCostRon: 100 },
      ],
    })
    const content = JSON.stringify(doc.content)
    expect(content).toContain('Total labour: 400 RON')
    expect(content).toContain('Total parts: 250 RON')
  })

  it('shows a placeholder when there are no tasks in the period', () => {
    const doc = buildJobReportDocDefinition({ ...BASE_INPUT, tasks: [] })
    const content = JSON.stringify(doc.content)
    expect(content).toContain('No tasks logged in this period.')
  })

  it('always renders the RigLog branding footer, never an upgrade prompt', () => {
    const doc = buildJobReportDocDefinition(BASE_INPUT)
    const footer = doc.footer as (p: number, c: number) => unknown
    const rendered = JSON.stringify(footer(1, 1))
    expect(rendered).toContain('Documented with RigLog — riglog.ro')
    expect(rendered).not.toContain('Upgrade')
  })

  it('includes photos attached to a task', () => {
    const doc = buildJobReportDocDefinition({
      ...BASE_INPUT,
      tasks: [{ ...BASE_INPUT.tasks[0], photos: [{ dataUri: 'data:image/jpeg;base64,AAA', caption: null }] }],
    })
    const content = JSON.stringify(doc.content)
    expect(content).toContain('data:image/jpeg;base64,AAA')
  })
})
