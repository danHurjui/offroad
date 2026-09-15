jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

import { getServerSession } from 'next-auth'
import { requireSession } from '@/lib/authz'

const mockGetSession = getServerSession as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('requireSession', () => {
  it('returns 401 when no session', async () => {
    mockGetSession.mockResolvedValue(null)
    const result = await requireSession()
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.status).toBe(401)
  })

  it('returns proper JSON body on 401', async () => {
    mockGetSession.mockResolvedValue(null)
    const result = await requireSession()
    if (!result.ok) {
      const body = await result.error.json()
      expect(body.error).toBe('Unauthorized')
    }
  })

  it('accepts any authenticated user', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u-1' } })
    const result = await requireSession()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.session.user.id).toBe('u-1')
  })
})
