jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    partsRequest: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    partsRequestComment: { create: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { POST as CREATE } from '@/app/api/parts-requests/route'
import { PATCH } from '@/app/api/parts-requests/[id]/route'
import { POST as COMMENT } from '@/app/api/parts-requests/[id]/comments/route'

const mockGetSession = getServerSession as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockCreate = prisma.partsRequest.create as jest.Mock
const mockFindUnique = prisma.partsRequest.findUnique as jest.Mock
const mockUpdate = prisma.partsRequest.update as jest.Mock
const mockCommentCreate = prisma.partsRequestComment.create as jest.Mock

const VALID_BODY = {
  vehicleMake: 'Ford',
  vehicleModel: 'Mustang',
  partName: 'Trunk lid',
  partNumber: '',
  conditionAccepted: 'GOOD_USED',
  location: 'Bucharest, will ship',
  description: '',
}

function req(body: unknown) {
  return { json: () => Promise.resolve(body) } as never
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ user: { id: 'u1' } })
  mockUserFindUnique.mockResolvedValue({ isPro: true })
})

describe('POST /api/parts-requests', () => {
  it('returns 403 UPGRADE_REQUIRED for a free-tier user', async () => {
    mockUserFindUnique.mockResolvedValue({ isPro: false })
    const res = await CREATE(req(VALID_BODY))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('UPGRADE_REQUIRED')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid conditionAccepted', async () => {
    const res = await CREATE(req({ ...VALID_BODY, conditionAccepted: 'MINT' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await CREATE(req({ ...VALID_BODY, partName: '' }))
    expect(res.status).toBe(400)
  })

  it('creates the request for a Pro user', async () => {
    mockCreate.mockResolvedValue({ id: 'pr1', ...VALID_BODY })
    const res = await CREATE(req(VALID_BODY))
    expect(res.status).toBe(201)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', partName: 'Trunk lid' }) })
    )
  })
})

describe('PATCH /api/parts-requests/[id]', () => {
  const params = { id: 'pr1' }

  it('returns 404 when the request does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)
    const res = await PATCH(req({ status: 'FOUND' }), { params })
    expect(res.status).toBe(404)
  })

  it('returns 403 for a non-owner', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pr1', userId: 'someone-else' })
    const res = await PATCH(req({ status: 'FOUND' }), { params })
    expect(res.status).toBe(403)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('marks the request as FOUND for the owner', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pr1', userId: 'u1' })
    mockUpdate.mockResolvedValue({ id: 'pr1', status: 'FOUND' })
    const res = await PATCH(req({ status: 'FOUND' }), { params })
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'pr1' }, data: { status: 'FOUND' } })
  })
})

describe('POST /api/parts-requests/[id]/comments', () => {
  const params = { id: 'pr1' }

  it('returns 404 when the request does not exist', async () => {
    mockFindUnique.mockResolvedValue(null)
    const res = await COMMENT(req({ body: 'try this shop' }), { params })
    expect(res.status).toBe(404)
  })

  it('returns 400 for an empty comment', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pr1' })
    const res = await COMMENT(req({ body: '  ' }), { params })
    expect(res.status).toBe(400)
  })

  it('creates the comment', async () => {
    mockFindUnique.mockResolvedValue({ id: 'pr1' })
    mockCommentCreate.mockResolvedValue({ id: 'c1', body: 'try this shop', user: { displayName: 'Dan' } })
    const res = await COMMENT(req({ body: 'try this shop' }), { params })
    expect(res.status).toBe(201)
    expect(mockCommentCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { partsRequestId: 'pr1', userId: 'u1', body: 'try this shop' } })
    )
  })
})
