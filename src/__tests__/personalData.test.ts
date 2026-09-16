jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    vehicle: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    taskPhoto: { findMany: jest.fn() },
    foundStatePhoto: { findMany: jest.fn() },
    trailWaypoint: { findMany: jest.fn() },
    document: { findMany: jest.fn() },
    ticket: { findMany: jest.fn() },
    ticketVote: { findMany: jest.fn() },
    ticketComment: { findMany: jest.fn() },
    partsRequest: { findMany: jest.fn() },
    partsRequestComment: { findMany: jest.fn() },
    follow: { findMany: jest.fn() },
    donation: { findMany: jest.fn() },
    oAuthAccount: { findMany: jest.fn() },
  },
}))
jest.mock('@/lib/storage', () => ({ deleteUpload: jest.fn() }))

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { deleteUpload } from '@/lib/storage'
import { collectStorageKeys, collectUserData, deleteStoredFiles } from '@/lib/personalData'

const mockDeleteUpload = deleteUpload as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
  mockDeleteUpload.mockResolvedValue(undefined)
})

function stubKeyQueries({
  avatarUrl = null,
  coverPhotoUrls = [],
  receiptUrls = [],
  taskPhotoUrls = [],
  foundStatePhotoUrls = [],
  waypointPhotoUrls = [],
  documentFileUrls = [],
}: {
  avatarUrl?: string | null
  coverPhotoUrls?: (string | null)[]
  receiptUrls?: string[]
  taskPhotoUrls?: string[]
  foundStatePhotoUrls?: string[]
  waypointPhotoUrls?: string[]
  documentFileUrls?: string[]
} = {}) {
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ avatarUrl })
  ;(prisma.vehicle.findMany as jest.Mock).mockResolvedValue(coverPhotoUrls.map((coverPhotoUrl) => ({ coverPhotoUrl })))
  ;(prisma.task.findMany as jest.Mock).mockResolvedValue(receiptUrls.map((receiptUrl) => ({ receiptUrl })))
  ;(prisma.taskPhoto.findMany as jest.Mock).mockResolvedValue(taskPhotoUrls.map((url) => ({ url })))
  ;(prisma.foundStatePhoto.findMany as jest.Mock).mockResolvedValue(foundStatePhotoUrls.map((url) => ({ url })))
  ;(prisma.trailWaypoint.findMany as jest.Mock).mockResolvedValue(waypointPhotoUrls.map((photoUrl) => ({ photoUrl })))
  ;(prisma.document.findMany as jest.Mock).mockResolvedValue(documentFileUrls.map((fileUrl) => ({ fileUrl })))
}

/**
 * The reason this exists: deleting a User or a Vehicle cascades the rows
 * but leaves every uploaded file sitting in storage. A key missed here is
 * a photo that survives an erasure request.
 */
describe('collectStorageKeys', () => {
  it('gathers keys from every model that holds one', async () => {
    stubKeyQueries({
      avatarUrl: 'u1/avatar.jpg',
      coverPhotoUrls: ['u1/v1/cover.jpg'],
      receiptUrls: ['u1/v1/receipt.pdf'],
      taskPhotoUrls: ['u1/v1/photo.jpg'],
      foundStatePhotoUrls: ['u1/v1/found.jpg'],
      waypointPhotoUrls: ['u1/v1/waypoint.jpg'],
      documentFileUrls: ['u1/v1/itp.pdf'],
    })

    const keys = await collectStorageKeys('u1')
    expect(keys.sort()).toEqual(
      [
        'u1/avatar.jpg',
        'u1/v1/cover.jpg',
        'u1/v1/found.jpg',
        'u1/v1/itp.pdf',
        'u1/v1/photo.jpg',
        'u1/v1/receipt.pdf',
        'u1/v1/waypoint.jpg',
      ].sort()
    )
  })

  it('skips nulls rather than trying to delete them', async () => {
    stubKeyQueries({ avatarUrl: null, coverPhotoUrls: [null, 'u1/v1/cover.jpg'] })
    expect(await collectStorageKeys('u1')).toEqual(['u1/v1/cover.jpg'])
  })

  // The same file can be referenced twice (a cover photo that is also a
  // task photo); deleting it twice is wasted work, not a bug, but the
  // reported count should be honest.
  it('de-duplicates', async () => {
    stubKeyQueries({ coverPhotoUrls: ['u1/v1/x.jpg'], taskPhotoUrls: ['u1/v1/x.jpg'] })
    expect(await collectStorageKeys('u1')).toEqual(['u1/v1/x.jpg'])
  })

  it('returns nothing for an account with no uploads', async () => {
    stubKeyQueries()
    expect(await collectStorageKeys('u1')).toEqual([])
  })

  // Scoping is the security-relevant part: one user's delete must never
  // reach another user's files.
  it('scopes every query to the owner', async () => {
    stubKeyQueries()
    await collectStorageKeys('owner-1')

    expect((prisma.user.findUnique as jest.Mock).mock.calls[0][0].where).toEqual({ id: 'owner-1' })
    expect((prisma.vehicle.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ ownerId: 'owner-1' })
    for (const model of [prisma.task, prisma.taskPhoto, prisma.trailWaypoint, prisma.document]) {
      const where = JSON.stringify((model.findMany as jest.Mock).mock.calls[0][0].where)
      expect(where).toContain('owner-1')
    }
  })

  it('narrows to one vehicle when asked, and leaves the avatar alone', async () => {
    stubKeyQueries({ avatarUrl: 'u1/avatar.jpg', coverPhotoUrls: ['u1/v1/cover.jpg'] })
    const keys = await collectStorageKeys('u1', 'v1')

    // The avatar belongs to the account, not the vehicle being deleted.
    expect(keys).toEqual(['u1/v1/cover.jpg'])
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect((prisma.vehicle.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      id: 'v1',
      ownerId: 'u1',
    })
  })
})

describe('deleteStoredFiles', () => {
  it('deletes each key', async () => {
    await deleteStoredFiles(['a', 'b', 'c'])
    expect(mockDeleteUpload).toHaveBeenCalledTimes(3)
  })

  /**
   * A storage hiccup must not leave someone unable to delete their
   * account. The rows are the thing that has to go; a stranded file is
   * logged and moved past.
   */
  it('does not throw when a file cannot be deleted', async () => {
    mockDeleteUpload.mockRejectedValueOnce(new Error('blob unreachable'))
    await expect(deleteStoredFiles(['a', 'b'])).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })

  it('still deletes the rest after one fails', async () => {
    mockDeleteUpload.mockRejectedValueOnce(new Error('nope'))
    await deleteStoredFiles(['a', 'b', 'c'])
    expect(mockDeleteUpload).toHaveBeenCalledTimes(3)
  })

  it('does nothing, and logs nothing, for an empty list', async () => {
    await deleteStoredFiles([])
    expect(mockDeleteUpload).not.toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })
})

describe('collectUserData', () => {
  const ACCOUNT = { id: 'u1', email: 'dan@example.com', displayName: 'Dan' }

  function stubExport(overrides: Record<string, unknown> = {}) {
    ;(prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(ACCOUNT)
    ;(prisma.vehicle.findMany as jest.Mock).mockResolvedValue(overrides.vehicles ?? [])
    ;(prisma.ticket.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.ticketVote.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.ticketComment.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.partsRequest.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.partsRequestComment.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.follow.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.donation.findMany as jest.Mock).mockResolvedValue(overrides.donations ?? [])
    ;(prisma.oAuthAccount.findMany as jest.Mock).mockResolvedValue([])
  }

  it('includes the account and every section', async () => {
    stubExport()
    const data = await collectUserData('u1')
    expect(data.account).toEqual(ACCOUNT)
    expect(data).toHaveProperty('vehicles')
    expect(data).toHaveProperty('feedback')
    expect(data).toHaveProperty('partsWanted')
    expect(data).toHaveProperty('following')
    expect(data).toHaveProperty('donations')
    expect(data).toHaveProperty('linkedLogins')
    expect(data.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  /**
   * Handing the bcrypt hash back helps an attacker who already has the
   * file and helps the account's owner not at all.
   */
  it('never selects the password hash', async () => {
    stubExport()
    await collectUserData('u1')
    const select = (prisma.user.findUniqueOrThrow as jest.Mock).mock.calls[0][0].select
    expect(select.password).toBeUndefined()
    expect(select.stripeCustomerId).toBeUndefined()
    expect(select.stripeSubscriptionId).toBeUndefined()
  })

  it('does not include push subscriptions — those are device credentials', async () => {
    stubExport()
    const data = await collectUserData('u1')
    expect(JSON.stringify(data)).not.toContain('pushSubscription')
  })

  it('reads only the requesting user’s rows', async () => {
    stubExport()
    await collectUserData('u1')
    expect((prisma.ticket.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ authorId: 'u1' })
    expect((prisma.ticketVote.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ userId: 'u1' })
    expect((prisma.follow.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ followerUserId: 'u1' })
    expect((prisma.vehicle.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ ownerId: 'u1' })
  })

  /**
   * Pitfall #5: Prisma hands back Decimal objects and JSON.stringify turns
   * those into strings. An export that says "150.00" where a number
   * belongs is not machine-readable in the way Art. 20 means.
   */
  it('serialises costs as numbers, not Decimal strings', async () => {
    stubExport({
      vehicles: [
        {
          id: 'v1',
          tasks: [
            {
              id: 't1',
              costRon: new Prisma.Decimal('150.00'),
              partsCostRon: new Prisma.Decimal('100.50'),
              labourCostRon: null,
            },
          ],
          foundState: { purchasePriceRon: new Prisma.Decimal('8000') },
          wishlistItems: [
            {
              id: 'w1',
              estimatedCostRon: new Prisma.Decimal('250.25'),
              targetPriceRon: null,
              priceHistory: [{ id: 'p1', priceRon: new Prisma.Decimal('199.99') }],
            },
          ],
        },
      ],
    })

    const data = await collectUserData('u1')
    const parsed = JSON.parse(JSON.stringify(data))
    const vehicle = parsed.vehicles[0]

    expect(vehicle.tasks[0].costRon).toBe(150)
    expect(vehicle.tasks[0].partsCostRon).toBe(100.5)
    expect(vehicle.tasks[0].labourCostRon).toBeNull()
    expect(vehicle.foundState.purchasePriceRon).toBe(8000)
    expect(vehicle.wishlistItems[0].estimatedCostRon).toBe(250.25)
    expect(vehicle.wishlistItems[0].targetPriceRon).toBeNull()
    expect(vehicle.wishlistItems[0].priceHistory[0].priceRon).toBe(199.99)
  })

  it('handles a vehicle with no found state', async () => {
    stubExport({ vehicles: [{ id: 'v1', tasks: [], foundState: null, wishlistItems: [] }] })
    const data = await collectUserData('u1')
    expect(data.vehicles[0].foundState).toBeNull()
  })

  it('reports donation amounts in RON as well as bani', async () => {
    stubExport({ donations: [{ id: 'd1', amountBani: 5000, currency: 'ron', status: 'PAID' }] })
    const data = await collectUserData('u1')
    expect(data.donations[0]).toMatchObject({ amountBani: 5000, amountRon: 50 })
  })
})
