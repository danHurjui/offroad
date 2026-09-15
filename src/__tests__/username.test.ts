jest.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() } },
}))

import { prisma } from '@/lib/prisma'
import { generateUsername, ensureUsername } from '@/lib/username'

const mockFindUnique = prisma.user.findUnique as jest.Mock
const mockFindUniqueOrThrow = prisma.user.findUniqueOrThrow as jest.Mock
const mockUpdate = prisma.user.update as jest.Mock

beforeEach(() => jest.clearAllMocks())

describe('generateUsername', () => {
  it('slugifies the seed when available', async () => {
    mockFindUnique.mockResolvedValue(null)
    const username = await generateUsername('Dan Hurjui')
    expect(username).toBe('dan-hurjui')
  })

  it('appends a suffix on collision', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'existing' }).mockResolvedValueOnce(null)
    const username = await generateUsername('Dan Hurjui')
    expect(username).toBe('dan-hurjui-2')
  })

  it('falls back to "user" for a seed with no alphanumeric characters', async () => {
    mockFindUnique.mockResolvedValue(null)
    const username = await generateUsername('###')
    expect(username).toBe('user')
  })
})

describe('ensureUsername', () => {
  it('returns the existing username without writing anything', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ username: 'dan', displayName: 'Dan' })
    const username = await ensureUsername('u1')
    expect(username).toBe('dan')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('generates and saves a username when missing', async () => {
    mockFindUniqueOrThrow.mockResolvedValue({ username: null, displayName: 'Dan Hurjui' })
    mockFindUnique.mockResolvedValue(null)
    mockUpdate.mockResolvedValue({})
    const username = await ensureUsername('u1')
    expect(username).toBe('dan-hurjui')
    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { username: 'dan-hurjui' } })
  })
})
