jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}))

import webpush from 'web-push'
import { sendPushNotification } from '@/lib/webpush'

const mockSendNotification = webpush.sendNotification as jest.Mock

const SUBSCRIPTION = { endpoint: 'https://push.example.com/x', p256dh: 'p256dh-key', auth: 'auth-key' }
const PAYLOAD = { title: 'RigLog', body: 'Update', url: 'https://riglog.ro/builds/dan/tj' }

describe('sendPushNotification', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
    jest.clearAllMocks()
  })

  it('returns "skipped" when VAPID keys are not configured', async () => {
    process.env = { ...originalEnv, VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '' }
    const result = await sendPushNotification(SUBSCRIPTION, PAYLOAD)
    expect(result).toBe('skipped')
    expect(mockSendNotification).not.toHaveBeenCalled()
  })

  it('sends the notification when configured', async () => {
    process.env = { ...originalEnv, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }
    mockSendNotification.mockResolvedValue(undefined)
    const result = await sendPushNotification(SUBSCRIPTION, PAYLOAD)
    expect(result).toBe('sent')
    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: SUBSCRIPTION.p256dh, auth: SUBSCRIPTION.auth } },
      JSON.stringify(PAYLOAD)
    )
  })

  it('returns "gone" on a 404/410 from the push service', async () => {
    process.env = { ...originalEnv, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }
    mockSendNotification.mockRejectedValue({ statusCode: 410 })
    const result = await sendPushNotification(SUBSCRIPTION, PAYLOAD)
    expect(result).toBe('gone')
  })

  it('rethrows other errors', async () => {
    process.env = { ...originalEnv, VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }
    mockSendNotification.mockRejectedValue({ statusCode: 500 })
    await expect(sendPushNotification(SUBSCRIPTION, PAYLOAD)).rejects.toEqual({ statusCode: 500 })
  })
})
