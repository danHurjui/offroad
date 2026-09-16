jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn(), update: jest.fn() },
    task: { findMany: jest.fn(), findUnique: jest.fn() },
    foundState: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { GET as getVehicle } from '@/app/api/vehicles/[id]/route'
import { GET as getTasks } from '@/app/api/vehicles/[id]/tasks/route'
import { GET as getTask } from '@/app/api/vehicles/[id]/tasks/[taskId]/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockTaskFindMany = prisma.task.findMany as jest.Mock
const mockTaskFindUnique = prisma.task.findUnique as jest.Mock
const mockCollabFindFirst = prisma.projectCollaborator.findFirst as jest.Mock

// Prisma returns Decimal objects for cost columns (CLAUDE.md pitfall #5).
const decimal = (n: number) => ({ toNumber: () => n })

const TASK = {
  id: 't1',
  vehicleId: 'v1',
  name: 'Winch',
  workType: 'DIY',
  costRon: decimal(1234.56),
  partsCostRon: null,
  labourCostRon: null,
  photos: [],
}
const WORKSHOP_TASK = {
  ...TASK,
  id: 't2',
  workType: 'WORKSHOP',
  costRon: null,
  partsCostRon: decimal(1000),
  labourCostRon: decimal(250),
}

function vehicle(hideCostsFromCollaborators: boolean) {
  return { id: 'v1', ownerId: 'owner', projectType: 'OFFROAD', hideCostsFromCollaborators }
}

function req(url = 'http://localhost/api/vehicles/v1/tasks') {
  return { url } as never
}

const params = { id: 'v1' }

beforeEach(() => {
  jest.clearAllMocks()
  mockTaskFindMany.mockResolvedValue([TASK, WORKSHOP_TASK])
  mockTaskFindUnique.mockResolvedValue(TASK)
  mockCollabFindFirst.mockResolvedValue({ id: 'c1', status: 'ACTIVE' })
})

describe('Decimal cost serialization (pitfall #5)', () => {
  it('GET /api/vehicles/[id] returns costs as numbers, not strings', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
    mockVehicleFindUnique.mockResolvedValue(vehicle(false))

    const body = await (await getVehicle(req(), { params })).json()
    expect(typeof body.tasks[0].costRon).toBe('number')
    expect(body.tasks[0].costRon).toBe(1234.56)
    expect(typeof body.tasks[1].partsCostRon).toBe('number')
    expect(body.tasks[1].totalCostRon).toBe(1250)
  })
})

describe('hideCostsFromCollaborators (RL-031)', () => {
  it('still shows costs to the owner when the flag is on', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
    mockVehicleFindUnique.mockResolvedValue(vehicle(true))

    const body = await (await getVehicle(req(), { params })).json()
    expect(body.isOwner).toBe(true)
    expect(body.tasks[0].costRon).toBe(1234.56)
  })

  it('shows costs to a collaborator when the flag is off', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'collab' } })
    mockVehicleFindUnique.mockResolvedValue(vehicle(false))

    const body = await (await getVehicle(req(), { params })).json()
    expect(body.isOwner).toBe(false)
    expect(body.tasks[0].costRon).toBe(1234.56)
  })

  // Regression: the flag was only honoured by the pages that render costs,
  // so a collaborator could read them straight off the JSON API.
  it('redacts costs from a collaborator on GET /api/vehicles/[id]', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'collab' } })
    mockVehicleFindUnique.mockResolvedValue(vehicle(true))

    const body = await (await getVehicle(req(), { params })).json()
    expect(body.isOwner).toBe(false)
    for (const t of body.tasks) {
      expect(t.costRon).toBeNull()
      expect(t.partsCostRon).toBeNull()
      expect(t.labourCostRon).toBeNull()
      expect(t.totalCostRon).toBeNull()
    }
    // non-cost fields still come through
    expect(body.tasks[0].name).toBe('Winch')
  })

  it('redacts costs from a collaborator on GET /api/vehicles/[id]/tasks', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'collab' } })
    mockVehicleFindUnique.mockResolvedValue(vehicle(true))

    const body = await (await getTasks(req(), { params })).json()
    expect(body).toHaveLength(2)
    for (const t of body) {
      expect(t.costRon).toBeNull()
      expect(t.partsCostRon).toBeNull()
      expect(t.labourCostRon).toBeNull()
    }
  })

  it('redacts costs from a collaborator on the task detail route', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'collab' } })
    mockVehicleFindUnique.mockResolvedValue(vehicle(true))

    const body = await (await getTask(req(), { params: { id: 'v1', taskId: 't1' } })).json()
    expect(body.name).toBe('Winch')
    expect(body.costRon).toBeNull()
    expect(body.totalCostRon).toBeNull()
  })
})
