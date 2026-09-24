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
    task: { findUnique: jest.fn(), update: jest.fn() },
  },
}))
jest.mock('@/lib/followNotify', () => ({ notifyFollowers: jest.fn().mockResolvedValue(undefined) }))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { notifyFollowers } from '@/lib/followNotify'
import { PATCH } from '@/app/api/vehicles/[id]/tasks/[taskId]/route'

const mockGetSession = getServerSession as jest.Mock
const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockTaskFindUnique = prisma.task.findUnique as jest.Mock
const mockTaskUpdate = prisma.task.update as jest.Mock
const mockNotifyFollowers = notifyFollowers as jest.Mock

const VEHICLE = { id: 'v1', ownerId: 'owner', projectType: 'OFFROAD' }
const params = { id: 'v1', taskId: 't1' }
function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'owner' } })
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
})

describe('PATCH /api/vehicles/[id]/tasks/[taskId] — follow notifications', () => {
  it('notifies followers when a task transitions into DONE', async () => {
    mockTaskFindUnique.mockResolvedValue({ id: 't1', vehicleId: 'v1', addedByUserId: 'owner', name: 'Lift kit', status: 'PLANNED', category: 'SUSPENSION', photos: [] })
    mockTaskUpdate.mockResolvedValue({ id: 't1', name: 'Lift kit', status: 'DONE', photos: [] })
    const res = await PATCH(req({ status: 'DONE' }), { params })
    expect(res.status).toBe(200)
    expect(mockNotifyFollowers).toHaveBeenCalledWith('v1', {
      key: 'taskDone',
      values: { task: 'Lift kit' },
    })
  })

  it('does not notify when the task was already DONE', async () => {
    mockTaskFindUnique.mockResolvedValue({ id: 't1', vehicleId: 'v1', addedByUserId: 'owner', name: 'Lift kit', status: 'DONE', category: 'SUSPENSION', photos: [] })
    mockTaskUpdate.mockResolvedValue({ id: 't1', name: 'Lift kit', status: 'DONE', photos: [] })
    await PATCH(req({ notes: 'updated notes' }), { params })
    expect(mockNotifyFollowers).not.toHaveBeenCalled()
  })

  it('does not notify on a transition to a non-complete status', async () => {
    mockTaskFindUnique.mockResolvedValue({ id: 't1', vehicleId: 'v1', addedByUserId: 'owner', name: 'Lift kit', status: 'PLANNED', category: 'SUSPENSION', photos: [] })
    mockTaskUpdate.mockResolvedValue({ id: 't1', name: 'Lift kit', status: 'IN_PROGRESS', photos: [] })
    await PATCH(req({ status: 'IN_PROGRESS' }), { params })
    expect(mockNotifyFollowers).not.toHaveBeenCalled()
  })
})
