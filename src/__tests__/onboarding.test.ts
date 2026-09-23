import fs from 'fs'
import path from 'path'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { updateMany: jest.fn() },
    task: { count: jest.fn() },
    taskPhoto: { count: jest.fn() },
    document: { count: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import {
  ONBOARDING_STEPS,
  closeOnboarding,
  loadOnboardingCounts,
  onboardingState,
  shouldShowChecklist,
} from '@/lib/onboarding'
import { POST } from '@/app/api/me/onboarding/dismiss/route'

const mockGetSession = getServerSession as jest.Mock
const mockUpdateMany = prisma.user.updateMany as jest.Mock
const mockTaskCount = prisma.task.count as jest.Mock
const mockPhotoCount = prisma.taskPhoto.count as jest.Mock
const mockDocumentCount = prisma.document.count as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
  mockUpdateMany.mockResolvedValue({ count: 1 })
})

describe('onboardingState', () => {
  it('walks the four steps in order', () => {
    expect(ONBOARDING_STEPS).toEqual(['vehicle', 'task', 'photo', 'document'])
  })

  it('marks a step done once there is at least one of the thing', () => {
    const state = onboardingState({ vehicle: 1, task: 3, photo: 0, document: 0 })
    expect(state.steps).toEqual([
      { id: 'vehicle', done: true },
      { id: 'task', done: true },
      { id: 'photo', done: false },
      { id: 'document', done: false },
    ])
    expect(state.doneCount).toBe(2)
    expect(state.complete).toBe(false)
  })

  it('is complete only when every step is', () => {
    expect(onboardingState({ vehicle: 1, task: 1, photo: 1, document: 1 }).complete).toBe(true)
    expect(onboardingState({ vehicle: 1, task: 1, photo: 1, document: 0 }).complete).toBe(false)
  })
})

describe('shouldShowChecklist', () => {
  it('shows for a brand new account', () => {
    expect(shouldShowChecklist({ closedAt: null, ownedVehicles: 0, collaboratingVehicles: 0 })).toBe(true)
  })

  it('never shows again once closed, whatever the account looks like now', () => {
    const closedAt = new Date('2026-09-01')
    expect(shouldShowChecklist({ closedAt, ownedVehicles: 0, collaboratingVehicles: 0 })).toBe(false)
    expect(shouldShowChecklist({ closedAt, ownedVehicles: 1, collaboratingVehicles: 0 })).toBe(false)
  })

  it('stays out of the way of somebody who only works on other people’s vehicles', () => {
    expect(shouldShowChecklist({ closedAt: null, ownedVehicles: 0, collaboratingVehicles: 2 })).toBe(false)
    expect(shouldShowChecklist({ closedAt: null, ownedVehicles: 1, collaboratingVehicles: 2 })).toBe(true)
  })
})

describe('loadOnboardingCounts', () => {
  it('counts only rows on vehicles the account owns', async () => {
    mockTaskCount.mockResolvedValue(2)
    mockPhotoCount.mockResolvedValue(0)
    mockDocumentCount.mockResolvedValue(1)

    await expect(loadOnboardingCounts('u1', 1)).resolves.toEqual({ vehicle: 1, task: 2, photo: 0, document: 1 })
    expect(mockTaskCount).toHaveBeenCalledWith({ where: { vehicle: { ownerId: 'u1', organizationId: null } } })
    expect(mockPhotoCount).toHaveBeenCalledWith({ where: { task: { vehicle: { ownerId: 'u1', organizationId: null } } } })
    expect(mockDocumentCount).toHaveBeenCalledWith({ where: { vehicle: { ownerId: 'u1', organizationId: null } } })
  })
})

describe('closeOnboarding', () => {
  it('only ever sets the timestamp from null, so a repeat keeps the first one', async () => {
    await closeOnboarding('u1')
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 'u1', onboardingClosedAt: null },
      data: { onboardingClosedAt: expect.any(Date) },
    })
  })
})

describe('POST /api/me/onboarding/dismiss', () => {
  it('requires a session', async () => {
    mockGetSession.mockResolvedValue(null)
    const res = await POST()
    expect(res.status).toBe(401)
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it('refuses a deactivated account', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u1', active: false } })
    const res = await POST()
    expect(res.status).toBe(403)
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })

  it('closes the checklist on the caller’s own row', async () => {
    const res = await POST()
    expect(res.status).toBe(200)
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1', onboardingClosedAt: null } })
    )
  })

  it('answers 500 rather than throwing when the write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    mockUpdateMany.mockRejectedValue(new Error('db down'))
    const res = await POST()
    expect(res.status).toBe(500)
  })
})

describe('the migration', () => {
  const sql = fs.readFileSync(
    path.join(process.cwd(), 'prisma/migrations/20260923120000_onboarding_closed/migration.sql'),
    'utf8'
  )

  it('closes the checklist for accounts that already own a vehicle with a job', () => {
    expect(sql).toMatch(/UPDATE "User"/)
    expect(sql).toMatch(/JOIN "Task"/)
    expect(sql).toMatch(/"ownerId" = u\."id"/)
  })
})
