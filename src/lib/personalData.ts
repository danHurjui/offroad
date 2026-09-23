import { prisma } from './prisma'
import { deleteUpload } from './storage'
import { toNumberOrNull, vehicleMoney } from './serialize'

/**
 * GDPR plumbing: the two things a user is entitled to do with their own
 * data — take a copy of it (Art. 15 access / Art. 20 portability) and have
 * it erased (Art. 17).
 *
 * Both live here rather than in the routes so there is one list of what
 * "their data" actually is. A field added to the schema and forgotten in
 * one of these is the failure mode — an export that omits it, or an
 * erasure that leaves it behind.
 */

/**
 * Every storage key belonging to a user, across every model that holds one.
 *
 * Deleting a Vehicle or a User cascades the database rows but does nothing
 * about the bytes: uploads live under `<userId>/<vehicleId>/<uuid>` in
 * Vercel Blob or on disk, and a row's disappearance leaves its file behind
 * forever. That is both a storage leak and, for an erasure request, a
 * photo of someone's car still sitting in a bucket after they asked to be
 * deleted.
 *
 * Pass a vehicleId to scope it to that one vehicle.
 */
export async function collectStorageKeys(userId: string, vehicleId?: string): Promise<string[]> {
  const vehicleFilter = vehicleId ? { id: vehicleId, ownerId: userId } : { ownerId: userId }
  const underVehicle = vehicleId
    ? { vehicleId, vehicle: { ownerId: userId } }
    : { vehicle: { ownerId: userId } }

  const [user, vehicles, tasks, taskPhotos, foundStatePhotos, waypoints, documents, fuelEntries, accidentPhotos] = await Promise.all([
    // A user's avatar isn't tied to a vehicle, so it's skipped when the
    // caller only wants one vehicle's files.
    vehicleId ? null : prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } }),
    prisma.vehicle.findMany({ where: vehicleFilter, select: { coverPhotoUrl: true } }),
    prisma.task.findMany({ where: { ...underVehicle, receiptUrl: { not: null } }, select: { receiptUrl: true } }),
    prisma.taskPhoto.findMany({ where: { task: underVehicle }, select: { url: true } }),
    prisma.foundStatePhoto.findMany({
      where: { foundState: underVehicle },
      select: { url: true },
    }),
    prisma.trailWaypoint.findMany({
      where: { trailRun: underVehicle, photoUrl: { not: null } },
      select: { photoUrl: true },
    }),
    prisma.document.findMany({ where: { ...underVehicle, fileUrl: { not: null } }, select: { fileUrl: true } }),
    // RL-044: fill-up receipts.
    prisma.fuelEntry.findMany({ where: { ...underVehicle, receiptUrl: { not: null } }, select: { receiptUrl: true } }),
    // RL-050: photos of accidents and damage.
    prisma.accidentPhoto.findMany({ where: { accident: underVehicle }, select: { url: true } }),
  ])

  const keys = [
    user?.avatarUrl,
    ...vehicles.map((v) => v.coverPhotoUrl),
    ...tasks.map((t) => t.receiptUrl),
    ...taskPhotos.map((p) => p.url),
    ...foundStatePhotos.map((p) => p.url),
    ...waypoints.map((w) => w.photoUrl),
    ...documents.map((d) => d.fileUrl),
    ...fuelEntries.map((f) => f.receiptUrl),
    ...accidentPhotos.map((p) => p.url),
  ]

  // De-duplicated: the same key can legitimately appear twice (a cover
  // photo that is also a task photo), and deleting it twice is wasted work.
  return Array.from(new Set(keys.filter((k): k is string => Boolean(k))))
}

/**
 * Best-effort file cleanup. `deleteUpload` already swallows a missing file,
 * and a storage hiccup must not leave the user unable to delete their
 * account — the database rows are the thing that actually has to go, so a
 * failure here is logged and the caller carries on.
 */
export async function deleteStoredFiles(keys: string[]): Promise<void> {
  const results = await Promise.allSettled(keys.map((key) => deleteUpload(key)))
  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed > 0) {
    console.error(`[personalData] ${failed}/${keys.length} stored files could not be deleted`)
  }
}

/**
 * Everything held about one user, as plain JSON.
 *
 * Deliberately excluded, and each for a reason rather than convenience:
 * - `password` — a bcrypt hash. Handing it out helps an attacker who got
 *   hold of the file and helps the account's owner not at all.
 * - Stripe customer/subscription ids — identifiers for Stripe's systems,
 *   not personal data about the user; the billing portal is the right
 *   place to see payment records.
 * - Push subscription endpoints — device credentials, and anyone holding
 *   one can push to that browser.
 * - Other people's data: comments on the user's tickets, collaborators'
 *   names on their vehicles. Those belong to whoever wrote them.
 *
 * The photos themselves aren't inlined — a build's photos can be hundreds
 * of megabytes and this is one JSON response. Their storage keys are
 * included so a file can be matched to the row that referenced it, and
 * every photo is downloadable from the app itself.
 */
export async function collectUserData(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      displayName: true,
      username: true,
      location: true,
      avatarUrl: true,
      isPublicProfile: true,
      preferredMode: true,
      accountType: true,
      isPro: true,
      isProComped: true,
      proPlan: true,
      notifyFollowedEmail: true,
      notifyFollowedPush: true,
      // A fact about this person's account that they can ask us for, and
      // one they may well want: it is the answer to "when did I confirm
      // this address". The tokens themselves stay out, for the same
      // reason the password hash does — they are credentials, and an
      // export file is not where a live one should end up.
      emailVerifiedAt: true,
      onboardingClosedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const [vehicles, tickets, ticketVotes, ticketComments, partsRequests, partsComments, follows, donations, oauthAccounts, organizations] =
    await Promise.all([
      fetchVehicles(userId),
      prisma.ticket.findMany({ where: { authorId: userId }, orderBy: { createdAt: 'asc' } }),
      prisma.ticketVote.findMany({ where: { userId }, select: { ticketId: true, createdAt: true } }),
      prisma.ticketComment.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      prisma.partsRequest.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      prisma.partsRequestComment.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      prisma.follow.findMany({ where: { followerUserId: userId }, select: { vehicleId: true, createdAt: true } }),
      prisma.donation.findMany({
        where: { userId },
        select: { id: true, amountBani: true, currency: true, status: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Which providers are linked, not the tokens.
      prisma.oAuthAccount.findMany({ where: { userId }, select: { provider: true } }),
      // RL-038: the organisations this account belongs to and its role in
      // each. Other members are other people's data and stay out.
      prisma.organizationMember.findMany({
        where: { userId },
        select: { role: true, createdAt: true, organization: { select: { name: true, cui: true, billingAddress: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ])

  return {
    exportedAt: new Date().toISOString(),
    // Named so someone opening the file six months later knows what it is
    // and what the app does not hold.
    about:
      'A copy of the personal data RigLog holds about this account. ' +
      'Password hashes, payment-provider identifiers and push-notification ' +
      'credentials are deliberately excluded. Photos and documents are not ' +
      'inlined; their storage keys appear on the rows that reference them ' +
      'and the files are downloadable from the app.',
    account: user,
    vehicles: vehicles.map(serializeVehicle),
    feedback: { tickets, votes: ticketVotes, comments: ticketComments },
    partsWanted: { requests: partsRequests, comments: partsComments },
    following: follows,
    donations: donations.map((d) => ({ ...d, amountRon: d.amountBani / 100 })),
    linkedLogins: oauthAccounts,
    organizations,
  }
}

/**
 * Prisma returns Decimal objects for every cost column, and
 * `JSON.stringify` turns those into strings ("150.00") rather than numbers
 * — see pitfall #5. An export is meant to be machine-readable somewhere
 * else, so the numbers go out as numbers.
 *
 * The parameter type is inferred from the query above rather than written
 * out, so adding an include to that query can't leave this behind.
 */
type VehicleWithRelations = Awaited<ReturnType<typeof fetchVehicles>>[number]

function fetchVehicles(userId: string) {
  return prisma.vehicle.findMany({
    where: { ownerId: userId },
    include: {
      tasks: { include: { photos: true }, orderBy: { date: 'asc' } },
      foundState: { include: { photos: true } },
      wishlistItems: { include: { priceHistory: true } },
      documents: true,
      trailRuns: { include: { waypoints: true } },
      collaborators: true,
      odometerReadings: { orderBy: { readAt: 'asc' } },
      fuelEntries: { orderBy: { date: 'asc' } },
      tyreSets: true,
      expenses: { orderBy: { date: 'asc' } },
      accidents: { include: { photos: true }, orderBy: { date: 'asc' } },
      // The token is left out: it is a live credential, and an export file
      // is copied, mailed and uploaded to other services.
      passportLinks: { select: { id: true, showPlate: true, showVin: true, showCosts: true, createdAt: true, revokedAt: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
}

function serializeVehicle(vehicle: VehicleWithRelations) {
  return {
    ...vehicle,
    ...vehicleMoney(vehicle),
    tasks: vehicle.tasks.map((task) => ({
      ...task,
      costRon: toNumberOrNull(task.costRon),
      partsCostRon: toNumberOrNull(task.partsCostRon),
      labourCostRon: toNumberOrNull(task.labourCostRon),
    })),
    foundState: vehicle.foundState
      ? { ...vehicle.foundState, purchasePriceRon: toNumberOrNull(vehicle.foundState.purchasePriceRon) }
      : null,
    wishlistItems: vehicle.wishlistItems.map((item) => ({
      ...item,
      estimatedCostRon: toNumberOrNull(item.estimatedCostRon),
      targetPriceRon: toNumberOrNull(item.targetPriceRon),
      priceHistory: item.priceHistory.map((entry) => ({
        ...entry,
        priceRon: toNumberOrNull(entry.priceRon),
      })),
    })),
    fuelEntries: vehicle.fuelEntries.map((entry) => ({
      ...entry,
      litres: toNumberOrNull(entry.litres),
      totalRon: toNumberOrNull(entry.totalRon),
    })),
    tyreSets: vehicle.tyreSets.map((set) => ({
      ...set,
      treadDepthMm: toNumberOrNull(set.treadDepthMm),
      costRon: toNumberOrNull(set.costRon),
    })),
    documents: vehicle.documents.map((doc) => ({ ...doc, costRon: toNumberOrNull(doc.costRon) })),
    expenses: vehicle.expenses.map((expense) => ({ ...expense, amountRon: toNumberOrNull(expense.amountRon) })),
    accidents: vehicle.accidents.map((accident) => ({ ...accident, repairCostRon: toNumberOrNull(accident.repairCostRon) })),
  }
}
