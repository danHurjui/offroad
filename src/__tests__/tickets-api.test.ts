jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    ticket: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    ticketVote: { create: jest.fn(), deleteMany: jest.fn(), count: jest.fn() },
    ticketComment: { create: jest.fn() },
    user: { findUnique: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { POST as createTicket } from '@/app/api/tickets/route'
import { PATCH as patchTicket, DELETE as deleteTicket } from '@/app/api/tickets/[id]/route'
import { POST as vote } from '@/app/api/tickets/[id]/vote/route'
import { POST as comment } from '@/app/api/tickets/[id]/comments/route'

const mockSession = getServerSession as jest.Mock
const mockTicketFindUnique = prisma.ticket.findUnique as jest.Mock
const mockTicketCreate = prisma.ticket.create as jest.Mock
const mockTicketUpdate = prisma.ticket.update as jest.Mock
const mockTicketDelete = prisma.ticket.delete as jest.Mock
const mockVoteCreate = prisma.ticketVote.create as jest.Mock
const mockVoteDeleteMany = prisma.ticketVote.deleteMany as jest.Mock
const mockVoteCount = prisma.ticketVote.count as jest.Mock
const mockCommentCreate = prisma.ticketComment.create as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock

function req(body?: unknown) {
  return { json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)) } as never
}
const params = { id: 't1' }

const AUTHOR = 'author-user'
const OTHER = 'other-user'
const ADMIN = 'admin-user'

beforeEach(() => {
  jest.clearAllMocks()
  mockTicketFindUnique.mockResolvedValue({ id: 't1', authorId: AUTHOR })
  mockUserFindUnique.mockResolvedValue({ isAdmin: false })
  mockVoteCount.mockResolvedValue(1)
  mockTicketUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 't1', type: 'BUG', status: 'OPEN', title: 't', description: 'd', adminNote: null, ...data })
  )
})

describe('POST /api/tickets', () => {
  it('requires a session', async () => {
    mockSession.mockResolvedValue(null)
    expect((await createTicket(req({ type: 'BUG', title: 'a', description: 'b' }))).status).toBe(401)
  })

  it('rejects an unknown type', async () => {
    mockSession.mockResolvedValue({ user: { id: AUTHOR } })
    expect((await createTicket(req({ type: 'WISH', title: 'a', description: 'b' }))).status).toBe(400)
  })

  it('rejects an over-long title', async () => {
    mockSession.mockResolvedValue({ user: { id: AUTHOR } })
    const res = await createTicket(req({ type: 'BUG', title: 'a'.repeat(200), description: 'b' }))
    expect(res.status).toBe(400)
  })

  it('creates the ticket with the author seeded as the first vote', async () => {
    mockSession.mockResolvedValue({ user: { id: AUTHOR } })
    mockTicketCreate.mockResolvedValue({ id: 't1', type: 'BUG', status: 'OPEN', title: 'a', _count: { votes: 1 } })
    const res = await createTicket(req({ type: 'BUG', title: ' a ', description: ' b ' }))
    expect(res.status).toBe(201)
    expect(mockTicketCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorId: AUTHOR,
          title: 'a',
          description: 'b',
          votes: { create: { userId: AUTHOR } },
        }),
      })
    )
  })

  // A client must not be able to open a ticket already marked PLANNED.
  it('ignores a client-supplied status', async () => {
    mockSession.mockResolvedValue({ user: { id: AUTHOR } })
    mockTicketCreate.mockResolvedValue({ id: 't1', type: 'BUG', status: 'OPEN', title: 'a', _count: { votes: 1 } })
    await createTicket(req({ type: 'BUG', title: 'a', description: 'b', status: 'DONE', authorId: OTHER }))
    const data = mockTicketCreate.mock.calls[0][0].data
    expect(data.status).toBeUndefined()
    expect(data.authorId).toBe(AUTHOR)
  })
})

describe('PATCH /api/tickets/[id] — separated author vs admin powers', () => {
  it('lets the author edit their own text', async () => {
    mockSession.mockResolvedValue({ user: { id: AUTHOR } })
    const res = await patchTicket(req({ title: 'corrected' }), { params })
    expect(res.status).toBe(200)
    expect(mockTicketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'corrected' } })
    )
  })

  it("stops a non-author editing someone else's text", async () => {
    mockSession.mockResolvedValue({ user: { id: OTHER } })
    const res = await patchTicket(req({ title: 'hijacked' }), { params })
    expect(res.status).toBe(403)
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })

  // The core rule: opening a request must not let you promote it yourself.
  it('stops the author setting their own status', async () => {
    mockSession.mockResolvedValue({ user: { id: AUTHOR } })
    const res = await patchTicket(req({ status: 'PLANNED' }), { params })
    expect(res.status).toBe(403)
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })

  it('stops an author sneaking a status change in alongside a legitimate edit', async () => {
    mockSession.mockResolvedValue({ user: { id: AUTHOR } })
    const res = await patchTicket(req({ title: 'fine', status: 'DONE' }), { params })
    expect(res.status).toBe(403)
    expect(mockTicketUpdate).not.toHaveBeenCalled()
  })

  it('lets an admin triage', async () => {
    mockSession.mockResolvedValue({ user: { id: ADMIN } })
    mockUserFindUnique.mockResolvedValue({ isAdmin: true })
    const res = await patchTicket(req({ status: 'PLANNED', adminNote: 'Queued' }), { params })
    expect(res.status).toBe(200)
    expect(mockTicketUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'PLANNED', adminNote: 'Queued' } })
    )
  })

  it("stops an admin rewriting the reporter's words", async () => {
    mockSession.mockResolvedValue({ user: { id: ADMIN } })
    mockUserFindUnique.mockResolvedValue({ isAdmin: true })
    const res = await patchTicket(req({ description: 'rewritten' }), { params })
    expect(res.status).toBe(403)
  })

  it('rejects an invalid status from an admin', async () => {
    mockSession.mockResolvedValue({ user: { id: ADMIN } })
    mockUserFindUnique.mockResolvedValue({ isAdmin: true })
    expect((await patchTicket(req({ status: 'SHIPPED' }), { params })).status).toBe(400)
  })

  it('404s for a missing ticket before checking anything else', async () => {
    mockSession.mockResolvedValue({ user: { id: AUTHOR } })
    mockTicketFindUnique.mockResolvedValue(null)
    expect((await patchTicket(req({ title: 'x' }), { params })).status).toBe(404)
  })
})

describe('DELETE /api/tickets/[id]', () => {
  it('lets the author withdraw their ticket', async () => {
    mockSession.mockResolvedValue({ user: { id: AUTHOR } })
    expect((await deleteTicket(req(), { params })).status).toBe(200)
    expect(mockTicketDelete).toHaveBeenCalled()
  })

  it("404s rather than 403s for someone else's ticket", async () => {
    mockSession.mockResolvedValue({ user: { id: OTHER } })
    expect((await deleteTicket(req(), { params })).status).toBe(404)
    expect(mockTicketDelete).not.toHaveBeenCalled()
  })

  it('lets an admin remove any ticket', async () => {
    mockSession.mockResolvedValue({ user: { id: ADMIN } })
    mockUserFindUnique.mockResolvedValue({ isAdmin: true })
    expect((await deleteTicket(req(), { params })).status).toBe(200)
  })
})

describe('POST /api/tickets/[id]/vote', () => {
  it('requires a session — no anonymous voting', async () => {
    mockSession.mockResolvedValue(null)
    expect((await vote(req(), { params })).status).toBe(401)
  })

  it('records a first vote', async () => {
    mockSession.mockResolvedValue({ user: { id: OTHER } })
    mockVoteCreate.mockResolvedValue({ id: 'v1' })
    mockVoteCount.mockResolvedValue(2)
    const res = await vote(req(), { params })
    expect(await res.json()).toEqual({ voted: true, voteCount: 2 })
  })

  // The unique constraint is the real guarantee; a second vote toggles off
  // rather than incrementing.
  it('toggles off when the unique constraint reports an existing vote', async () => {
    mockSession.mockResolvedValue({ user: { id: OTHER } })
    mockVoteCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' })
    )
    mockVoteCount.mockResolvedValue(1)
    const res = await vote(req(), { params })
    expect(await res.json()).toEqual({ voted: false, voteCount: 1 })
    expect(mockVoteDeleteMany).toHaveBeenCalledWith({
      where: { ticketId: 't1', userId: OTHER },
    })
  })

  it('does not swallow an unrelated database error as a toggle', async () => {
    mockSession.mockResolvedValue({ user: { id: OTHER } })
    mockVoteCreate.mockRejectedValue(new Error('connection lost'))
    const res = await vote(req(), { params })
    expect(res.status).toBe(500)
    expect(mockVoteDeleteMany).not.toHaveBeenCalled()
  })

  it('404s for an unknown ticket', async () => {
    mockSession.mockResolvedValue({ user: { id: OTHER } })
    mockTicketFindUnique.mockResolvedValue(null)
    expect((await vote(req(), { params })).status).toBe(404)
  })
})

describe('POST /api/tickets/[id]/comments', () => {
  it('requires a session', async () => {
    mockSession.mockResolvedValue(null)
    expect((await comment(req({ body: 'hi' }), { params })).status).toBe(401)
  })

  it('rejects an empty comment', async () => {
    mockSession.mockResolvedValue({ user: { id: OTHER } })
    expect((await comment(req({ body: '   ' }), { params })).status).toBe(400)
  })

  it('marks an admin reply as staff', async () => {
    mockSession.mockResolvedValue({ user: { id: ADMIN } })
    mockUserFindUnique.mockResolvedValue({ isAdmin: true })
    mockCommentCreate.mockResolvedValue({
      id: 'c1', body: 'On it', isStaff: true, createdAt: new Date(), user: { displayName: 'Admin' },
    })
    await comment(req({ body: 'On it' }), { params })
    expect(mockCommentCreate.mock.calls[0][0].data.isStaff).toBe(true)
  })

  it('does not mark a normal user as staff', async () => {
    mockSession.mockResolvedValue({ user: { id: OTHER } })
    mockCommentCreate.mockResolvedValue({
      id: 'c1', body: 'me too', isStaff: false, createdAt: new Date(), user: { displayName: 'User' },
    })
    await comment(req({ body: 'me too' }), { params })
    expect(mockCommentCreate.mock.calls[0][0].data.isStaff).toBe(false)
  })

  // A client must not be able to forge the staff badge on its own comment.
  it('ignores a client-supplied isStaff flag', async () => {
    mockSession.mockResolvedValue({ user: { id: OTHER } })
    mockCommentCreate.mockResolvedValue({
      id: 'c1', body: 'x', isStaff: false, createdAt: new Date(), user: { displayName: 'User' },
    })
    await comment(req({ body: 'x', isStaff: true }), { params })
    expect(mockCommentCreate.mock.calls[0][0].data.isStaff).toBe(false)
  })
})
