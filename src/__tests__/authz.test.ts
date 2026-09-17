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

  /**
   * The sentence is translated, so the assertion is on `code` — the half
   * a client can act on, and the half that does not change when the
   * wording does. The default locale here is Romanian, which is why the
   * old check on the English string stopped holding.
   */
  it('returns proper JSON body on 401', async () => {
    mockGetSession.mockResolvedValue(null)
    const result = await requireSession()
    if (!result.ok) {
      const body = await result.error.json()
      expect(body.code).toBe('unauthorized')
      expect(body.error).toMatch(/\S/)
    }
  })

  it('accepts any authenticated user', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u-1' } })
    const result = await requireSession()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.session.user.id).toBe('u-1')
  })
})
