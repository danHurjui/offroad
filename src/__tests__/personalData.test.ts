jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() },
    vehicle: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    taskPhoto: { findMany: jest.fn() },
    foundStatePhoto: { findMany: jest.fn() },
    trailWaypoint: { findMany: jest.fn() },
    document: { findMany: jest.fn() },
    fuelEntry: { findMany: jest.fn() },
    chargeEntry: { findMany: jest.fn() },
    batteryHealthReading: { findMany: jest.fn() },
    accidentPhoto: { findMany: jest.fn() },
    assignmentPhoto: { findMany: jest.fn() },
    ticket: { findMany: jest.fn() },
    ticketVote: { findMany: jest.fn() },
    ticketComment: { findMany: jest.fn() },
    partsRequest: { findMany: jest.fn() },
    partsRequestComment: { findMany: jest.fn() },
    follow: { findMany: jest.fn() },
    donation: { findMany: jest.fn() },
    oAuthAccount: { findMany: jest.fn() },
    organizationMember: { findMany: jest.fn() },
    trip: { findMany: jest.fn() },
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
  fuelReceiptUrls = [],
  chargeReceiptUrls = [],
  batteryReportUrls = [],
  accidentPhotoUrls = [],
  handoverPhotoUrls = [],
}: {
  avatarUrl?: string | null
  coverPhotoUrls?: (string | null)[]
  receiptUrls?: string[]
  taskPhotoUrls?: string[]
  foundStatePhotoUrls?: string[]
  waypointPhotoUrls?: string[]
  documentFileUrls?: string[]
  fuelReceiptUrls?: string[]
  chargeReceiptUrls?: string[]
  batteryReportUrls?: string[]
  accidentPhotoUrls?: string[]
  handoverPhotoUrls?: string[]
} = {}) {
  ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({ avatarUrl })
  ;(prisma.vehicle.findMany as jest.Mock).mockResolvedValue(coverPhotoUrls.map((coverPhotoUrl) => ({ coverPhotoUrl })))
  ;(prisma.task.findMany as jest.Mock).mockResolvedValue(receiptUrls.map((receiptUrl) => ({ receiptUrl })))
  ;(prisma.taskPhoto.findMany as jest.Mock).mockResolvedValue(taskPhotoUrls.map((url) => ({ url })))
  ;(prisma.foundStatePhoto.findMany as jest.Mock).mockResolvedValue(foundStatePhotoUrls.map((url) => ({ url })))
  ;(prisma.trailWaypoint.findMany as jest.Mock).mockResolvedValue(waypointPhotoUrls.map((photoUrl) => ({ photoUrl })))
  ;(prisma.document.findMany as jest.Mock).mockResolvedValue(documentFileUrls.map((fileUrl) => ({ fileUrl })))
  ;(prisma.fuelEntry.findMany as jest.Mock).mockResolvedValue(fuelReceiptUrls.map((receiptUrl) => ({ receiptUrl })))
  ;(prisma.chargeEntry.findMany as jest.Mock).mockResolvedValue(chargeReceiptUrls.map((receiptUrl) => ({ receiptUrl })))
  ;(prisma.batteryHealthReading.findMany as jest.Mock).mockResolvedValue(batteryReportUrls.map((reportUrl) => ({ reportUrl })))
  ;(prisma.accidentPhoto.findMany as jest.Mock).mockResolvedValue(accidentPhotoUrls.map((url) => ({ url })))
  ;(prisma.assignmentPhoto.findMany as jest.Mock).mockResolvedValue(handoverPhotoUrls.map((url) => ({ url })))
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
      fuelReceiptUrls: ['u1/v1/omv.jpg'],
      chargeReceiptUrls: ['u1/v1/ionity.pdf'],
      batteryReportUrls: ['u1/v1/soh-test.pdf'],
      accidentPhotoUrls: ['u1/v1/dent.jpg'],
      handoverPhotoUrls: ['u1/v1/handover.jpg'],
    })

    const keys = await collectStorageKeys('u1')
    expect(keys.sort()).toEqual(
      [
        'u1/avatar.jpg',
        'u1/v1/cover.jpg',
        'u1/v1/dent.jpg',
        'u1/v1/found.jpg',
        'u1/v1/handover.jpg',
        'u1/v1/itp.pdf',
        'u1/v1/omv.jpg',
        'u1/v1/ionity.pdf',
        'u1/v1/soh-test.pdf',
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
    for (const model of [prisma.task, prisma.taskPhoto, prisma.trailWaypoint, prisma.document, prisma.fuelEntry, prisma.chargeEntry, prisma.batteryHealthReading, prisma.accidentPhoto, prisma.assignmentPhoto]) {
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
    ;(prisma.organizationMember.findMany as jest.Mock).mockResolvedValue([])
    ;(prisma.trip.findMany as jest.Mock).mockResolvedValue([])
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
    expect(data).toHaveProperty('organizations')
    expect(data).toHaveProperty('tripsDriven')
    expect(data.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  // RL-051: where this person drove, on any vehicle, by their own id — not
  // who else is in the company.
  it('lists the trips this person drove', async () => {
    stubExport()
    await collectUserData('u1')
    const query = (prisma.trip.findMany as jest.Mock).mock.calls[0][0]
    expect(query.where).toEqual({ driverUserId: 'u1' })
    expect(query.select.driver).toBeUndefined()
    expect(query.select.createdBy).toBeUndefined()
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
    // Personal vehicles only: a company vehicle is the organisation's data.
    expect((prisma.vehicle.findMany as jest.Mock).mock.calls[0][0].where).toEqual({ ownerId: 'u1', organizationId: null })
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
          foundState: { odometer: 98000 },
          wishlistItems: [
            {
              id: 'w1',
              estimatedCostRon: new Prisma.Decimal('250.25'),
              targetPriceRon: null,
              priceHistory: [{ id: 'p1', priceRon: new Prisma.Decimal('199.99') }],
            },
          ],
          fuelEntries: [{ id: 'f1', litres: new Prisma.Decimal('42.37'), totalRon: new Prisma.Decimal('301.50') }],
          chargeEntries: [{ id: 'c1', kwh: new Prisma.Decimal('38.40'), totalRon: new Prisma.Decimal('0') }],
          tyreSets: [{ id: 't1', treadDepthMm: new Prisma.Decimal('4.5'), costRon: new Prisma.Decimal('1600') }],
          documents: [{ id: 'd1', costRon: new Prisma.Decimal('900.50') }],
          expenses: [{ id: 'e1', amountRon: new Prisma.Decimal('15') }],
          accidents: [{ id: 'a1', repairCostRon: new Prisma.Decimal('2400.50'), photos: [] }],
          purchasePriceRon: new Prisma.Decimal('40000'),
          currentValueRon: null,
          financeMonthlyRon: new Prisma.Decimal('1200.00'),
        },
      ],
    })

    const data = await collectUserData('u1')
    const parsed = JSON.parse(JSON.stringify(data))
    const vehicle = parsed.vehicles[0]

    expect(vehicle.tasks[0].costRon).toBe(150)
    expect(vehicle.tasks[0].partsCostRon).toBe(100.5)
    expect(vehicle.tasks[0].labourCostRon).toBeNull()
    // #105: the purchase is on the vehicle (below), not repeated in the intake.
    expect(vehicle.foundState).toEqual({ odometer: 98000 })
    expect(vehicle.wishlistItems[0].estimatedCostRon).toBe(250.25)
    expect(vehicle.wishlistItems[0].targetPriceRon).toBeNull()
    expect(vehicle.wishlistItems[0].priceHistory[0].priceRon).toBe(199.99)
    expect(vehicle.fuelEntries[0].litres).toBe(42.37)
    expect(vehicle.fuelEntries[0].totalRon).toBe(301.5)
    // RL-053: charges, a free one included.
    expect(vehicle.chargeEntries[0].kwh).toBe(38.4)
    expect(vehicle.chargeEntries[0].totalRon).toBe(0)
    // RL-045: the new money columns, and the expenses themselves.
    expect(vehicle.tyreSets[0].costRon).toBe(1600)
    expect(vehicle.documents[0].costRon).toBe(900.5)
    expect(vehicle.expenses[0].amountRon).toBe(15)
    expect(vehicle.purchasePriceRon).toBe(40000)
    expect(vehicle.currentValueRon).toBeNull()
    expect(vehicle.financeMonthlyRon).toBe(1200)
    // RL-050: accidents.
    expect(vehicle.accidents[0].repairCostRon).toBe(2400.5)
  })

  /**
   * RL-038: which organisations the account is in and its role there —
   * but not the other members, who are other people.
   */
  it('lists the account’s organisations without their other members', async () => {
    stubExport()
    await collectUserData('u1')
    const args = (prisma.organizationMember.findMany as jest.Mock).mock.calls[0][0]
    expect(args.where).toEqual({ userId: 'u1' })
    expect(args.select.organization.select).not.toHaveProperty('members')
  })

  it('handles a vehicle with no found state', async () => {
    stubExport({ vehicles: [{ id: 'v1', tasks: [], foundState: null, wishlistItems: [], fuelEntries: [], chargeEntries: [], tyreSets: [], documents: [], expenses: [], accidents: [] }] })
    const data = await collectUserData('u1')
    expect(data.vehicles[0].foundState).toBeNull()
  })

  it('reports donation amounts in RON as well as bani', async () => {
    stubExport({ donations: [{ id: 'd1', amountBani: 5000, currency: 'ron', status: 'PAID' }] })
    const data = await collectUserData('u1')
    expect(data.donations[0]).toMatchObject({ amountBani: 5000, amountRon: 50 })
  })
})

