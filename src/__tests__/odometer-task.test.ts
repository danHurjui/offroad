/**
 * RL-044: the km on a job is written with the job, in one transaction —
 * a refused reading refuses the job too, so it is never half-saved.
 */
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/storage', () => ({ deleteUpload: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/lib/prisma', () => {
  const client = {
    vehicle: { findUnique: jest.fn(), update: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    task: { create: jest.fn() },
    odometerReading: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  }
  // The interactive transaction runs its callback against the same mocks.
  client.$transaction.mockImplementation((fn: (tx: typeof client) => unknown) => fn(client))
  return { prisma: client }
})

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/vehicles/[id]/tasks/route'

const params = { id: 'v1' }
const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never
const JOB = { name: 'Brake pads', category: 'BRAKES', status: 'DONE', date: '2025-03-01' }

beforeEach(() => {
  jest.clearAllMocks()
  ;(prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma))
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'owner' } })
  ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ id: 'v1', ownerId: 'owner', projectType: 'DAILY_DRIVER' })
  ;(prisma.task.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 't1', ...data }))
  ;(prisma.odometerReading.findUnique as jest.Mock).mockResolvedValue(null)
  ;(prisma.odometerReading.findMany as jest.Mock).mockResolvedValue([
    { id: 'r1', km: 120_000, readAt: new Date('2025-01-15T00:00:00Z'), isOverride: false, createdAt: new Date() },
  ])
})

it('writes a TASK reading linked to the new job', async () => {
  const res = await POST(req({ ...JOB, odometerKm: '121500' }), { params })
  expect(res.status).toBe(201)
  expect(prisma.odometerReading.create).toHaveBeenCalledWith({
    data: {
      vehicleId: 'v1',
      taskId: 't1',
      km: 121_500,
      readAt: new Date('2025-03-01T00:00:00Z'),
      source: 'TASK',
      createdByUserId: 'owner',
    },
  })
})

it('refuses the whole job when its km breaks the history', async () => {
  const res = await POST(req({ ...JOB, odometerKm: 119_000 }), { params })
  expect(res.status).toBe(409)
  expect((await res.json()).code).toBe('odometerBelowEarlier')
  expect(prisma.odometerReading.create).not.toHaveBeenCalled()
  // The throw inside the transaction is what rolls the created task back.
  expect(prisma.$transaction).toHaveBeenCalledTimes(1)
})

it('refuses a km on a job dated in the future — it has not happened yet', async () => {
  const res = await POST(req({ ...JOB, status: 'DUE', date: '2999-01-01', odometerKm: 130_000 }), { params })
  expect(res.status).toBe(400)
  expect(prisma.task.create).not.toHaveBeenCalled()
})

it('leaves a job without km on the old path, with no transaction', async () => {
  const res = await POST(req(JOB), { params })
  expect(res.status).toBe(201)
  expect(prisma.$transaction).not.toHaveBeenCalled()
  expect(prisma.odometerReading.create).not.toHaveBeenCalled()
})

/**
 * Deleting a job: pitfall #14 says the files go too (this handler used to
 * orphan every photo and receipt), and RL-044 says its km does.
 */
describe('DELETE a job', () => {
  it('removes its files and its own TASK reading', async () => {
    const { prisma: client } = jest.requireMock('@/lib/prisma') as { prisma: Record<string, Record<string, jest.Mock>> }
    client.task.findUnique = jest.fn().mockResolvedValue({
      id: 't1',
      vehicleId: 'v1',
      receiptUrl: 'owner/v1/receipt.pdf',
      photos: [{ url: 'owner/v1/a.jpg' }, { url: 'owner/v1/b.jpg' }],
    })
    client.task.delete = jest.fn().mockResolvedValue({})
    client.odometerReading.deleteMany = jest.fn().mockResolvedValue({ count: 1 })
    const storage = jest.requireMock('@/lib/storage') as { deleteUpload: jest.Mock }
    const { DELETE } = await import('@/app/api/vehicles/[id]/tasks/[taskId]/route')

    const res = await DELETE({} as never, { params: { id: 'v1', taskId: 't1' } })
    expect(res.status).toBe(200)
    expect(client.odometerReading.deleteMany).toHaveBeenCalledWith({ where: { taskId: 't1', source: 'TASK' } })
    expect(storage.deleteUpload.mock.calls.map((c) => c[0]).sort()).toEqual(
      ['owner/v1/a.jpg', 'owner/v1/b.jpg', 'owner/v1/receipt.pdf'].sort()
    )
  })
})
