jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    follow: { findMany: jest.fn() },
    pushSubscription: { delete: jest.fn() },
  },
}))
jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  // The builder now returns the subject alongside the body, because the
  // two have to be in the same language.
  followedProjectUpdateEmail: jest
    .fn()
    .mockImplementation(async (_locale: string, input: { vehicleName: string }) => ({
      subject: `${input.vehicleName} — update on RigLog`,
      html: '<p>update</p>',
    })),
  emailLocale: jest.fn().mockReturnValue('ro'),
}))
// Followers are notified in their own language, so the message is a
// catalogue key resolved once per follower.
// The email/notification path builds its translator directly from the
// catalogue (src/i18n/translator.ts), so there is no request context to
// stub — only a locale to pass.
jest.mock('@/i18n/translator', () => ({
  translator: jest.fn().mockResolvedValue((key: string) => `t:${key}`),
}))
jest.mock('@/lib/webpush', () => ({
  sendPushNotification: jest.fn(),
}))

import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { sendPushNotification } from '@/lib/webpush'
import { notifyFollowers } from '@/lib/followNotify'

const mockVehicleFindUnique = prisma.vehicle.findUnique as jest.Mock
const mockFollowFindMany = prisma.follow.findMany as jest.Mock
const mockPushSubDelete = prisma.pushSubscription.delete as jest.Mock
const mockSendEmail = sendEmail as jest.Mock
const mockSendPush = sendPushNotification as jest.Mock

const VEHICLE = { year: 2001, make: 'Jeep', model: 'Wrangler', slug: 'wrangler', isPublic: true, owner: { username: 'dan' } }

beforeEach(() => {
  jest.clearAllMocks()
  mockVehicleFindUnique.mockResolvedValue(VEHICLE)
})

describe('notifyFollowers', () => {
  it('does nothing when the vehicle has no followers', async () => {
    mockFollowFindMany.mockResolvedValue([])
    await notifyFollowers('v1', { key: 'taskDone', values: { task: 'Something' } })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  /**
   * A project that has gone private — switched off, or moved into an
   * organisation — tells its followers nothing more.
   */
  it('does nothing once the vehicle is no longer public', async () => {
    mockVehicleFindUnique.mockResolvedValue({ ...VEHICLE, isPublic: false })
    mockFollowFindMany.mockResolvedValue([
      { follower: { email: 'a@x.com', notifyFollowedEmail: true, notifyFollowedPush: true, pushSubscriptions: [{ id: 's1' }] } },
    ])
    await notifyFollowers('v1', { key: 'taskDone', values: { task: 'Something' } })
    expect(mockSendEmail).not.toHaveBeenCalled()
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('emails a follower with notifyFollowedEmail on, and skips one with it off', async () => {
    mockFollowFindMany.mockResolvedValue([
      { follower: { email: 'a@x.com', notifyFollowedEmail: true, notifyFollowedPush: false, pushSubscriptions: [] } },
      { follower: { email: 'b@x.com', notifyFollowedEmail: false, notifyFollowedPush: false, pushSubscriptions: [] } },
    ])
    await notifyFollowers('v1', { key: 'taskDone', values: { task: 'Lift kit' } })
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@x.com' }))
  })

  it('sends push to every subscribed device for a follower with notifyFollowedPush on', async () => {
    mockFollowFindMany.mockResolvedValue([
      {
        follower: {
          email: 'a@x.com',
          notifyFollowedEmail: false,
          notifyFollowedPush: true,
          pushSubscriptions: [
            { id: 'sub1', endpoint: 'e1', p256dh: 'p1', auth: 'a1' },
            { id: 'sub2', endpoint: 'e2', p256dh: 'p2', auth: 'a2' },
          ],
        },
      },
    ])
    mockSendPush.mockResolvedValue('sent')
    await notifyFollowers('v1', { key: 'photosAdded', values: { task: 'Lift kit' } })
    expect(mockSendPush).toHaveBeenCalledTimes(2)
  })

  it('deletes a push subscription when the push service reports it is gone', async () => {
    mockFollowFindMany.mockResolvedValue([
      {
        follower: {
          email: 'a@x.com',
          notifyFollowedEmail: false,
          notifyFollowedPush: true,
          pushSubscriptions: [{ id: 'sub1', endpoint: 'e1', p256dh: 'p1', auth: 'a1' }],
        },
      },
    ])
    mockSendPush.mockResolvedValue('gone')
    mockPushSubDelete.mockResolvedValue({})
    await notifyFollowers('v1', { key: 'photosAdded', values: { task: 'Lift kit' } })
    expect(mockPushSubDelete).toHaveBeenCalledWith({ where: { id: 'sub1' } })
  })

  it('builds the notification URL from the public profile path, not the dashboard', async () => {
    mockFollowFindMany.mockResolvedValue([
      { follower: { email: 'a@x.com', notifyFollowedEmail: true, notifyFollowedPush: false, pushSubscriptions: [] } },
    ])
    await notifyFollowers('v1', { key: 'taskDone', values: { task: 'Lift kit' } })
    const call = mockSendEmail.mock.calls[0][0]
    expect(call.subject).toContain('2001 Jeep Wrangler')
  })
})
