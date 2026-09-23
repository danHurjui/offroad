jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn(), update: jest.fn() },
    task: { findMany: jest.fn(), findUnique: jest.fn() },
    foundState: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    organizationMember: { findUnique: jest.fn() },
    vehicleAssignment: { findFirst: jest.fn() },
  },
}))

import fs from 'fs'
import path from 'path'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { hidesCosts } from '@/lib/access'
import { GET as getVehicle } from '@/app/api/vehicles/[id]/route'
import { GET as getTasks } from '@/app/api/vehicles/[id]/tasks/route'
import { GET as getTask } from '@/app/api/vehicles/[id]/tasks/[taskId]/route'

/**
 * RL-040: a driver never sees a company vehicle's costs — whatever
 * `hideCostsFromCollaborators` says. Proved on the responses themselves,
 * not by reading the code: the ticket's own advice.
 */

const decimal = (n: number) => ({ toNumber: () => n })
const COMPANY = {
  id: 'v1', ownerId: 'record', organizationId: 'o1', projectType: 'DAILY_DRIVER',
  hideCostsFromCollaborators: false, // the owner hides nothing from collaborators
  purchasePriceRon: decimal(50000), currentValueRon: decimal(40000), financeMonthlyRon: decimal(900),
}
const TASK = {
  id: 't1', vehicleId: 'v1', name: 'Brake pads', workType: 'WORKSHOP',
  costRon: decimal(10), partsCostRon: decimal(300), labourCostRon: decimal(150), photos: [],
}
const MONEY = ['costRon', 'partsCostRon', 'labourCostRon']

beforeEach(() => {
  jest.clearAllMocks()
  ;(getServerSession as jest.Mock).mockResolvedValue({ user: { id: 'driver', active: true } })
  ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue(COMPANY)
  ;(prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({ role: 'DRIVER' })
  ;(prisma.vehicleAssignment.findFirst as jest.Mock).mockResolvedValue({ id: 'a1' })
  ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue(null)
  ;(prisma.task.findMany as jest.Mock).mockResolvedValue([TASK])
  ;(prisma.task.findUnique as jest.Mock).mockResolvedValue(TASK)
  ;(prisma.foundState.findUnique as jest.Mock).mockResolvedValue(null)
})

function carriesNoMoney(value: unknown) {
  const json = JSON.stringify(value)
  for (const n of ['300', '150', '50000', '40000', '900']) expect(json).not.toContain(n)
}

describe('an assigned driver', () => {
  it('gets the task list without a single cost', async () => {
    const res = await getTasks({ url: 'http://x/api/vehicles/v1/tasks' } as never, { params: { id: 'v1' } })
    expect(res.status).toBe(200)
    const tasks = await res.json()
    for (const task of Array.isArray(tasks) ? tasks : tasks.tasks) {
      for (const field of MONEY) expect(task[field] ?? null).toBeNull()
    }
    carriesNoMoney(tasks)
  })

  it('gets one task without its costs', async () => {
    const res = await getTask({} as never, { params: { id: 'v1', taskId: 't1' } })
    expect(res.status).toBe(200)
    const task = await res.json()
    for (const field of MONEY) expect(task[field] ?? null).toBeNull()
  })

  it('gets the vehicle without its purchase, value or finance', async () => {
    const res = await getVehicle({} as never, { params: { id: 'v1' } })
    expect(res.status).toBe(200)
    carriesNoMoney(await res.json())
  })

  it('once unassigned, gets nothing at all', async () => {
    ;(prisma.vehicleAssignment.findFirst as jest.Mock).mockResolvedValue(null)
    expect((await getTask({} as never, { params: { id: 'v1', taskId: 't1' } })).status).toBe(404)
  })
})

describe('hidesCosts', () => {
  it('never from the owner, always from a driver, from a collaborator when switched on', () => {
    expect(hidesCosts({ access: 'owner', hideCostsFromCollaborators: true })).toBe(false)
    expect(hidesCosts({ access: 'driver', hideCostsFromCollaborators: false })).toBe(true)
    expect(hidesCosts({ access: 'collaborator', hideCostsFromCollaborators: false })).toBe(false)
    expect(hidesCosts({ access: 'collaborator', hideCostsFromCollaborators: true })).toBe(true)
  })

  /** One rule, one place: nothing re-derives it from the flag. */
  it('is the only place the switch is read to decide', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__') walk(full)
        } else if (/\.tsx?$/.test(entry.name) && !full.endsWith(path.join('lib', 'access.ts'))) {
          fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
            if (/(&&|\|\||!)\s*\w+\.hideCostsFromCollaborators/.test(line)) offenders.push(`${full}:${i + 1}`)
          })
        }
      }
    }
    walk(path.join(process.cwd(), 'src'))
    expect(offenders).toEqual([])
  })
})
