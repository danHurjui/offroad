jest.mock('web-push', () => ({
  __esModule: true,
  default: { setVapidDetails: jest.fn(), sendNotification: jest.fn() },
}))

/**
 * A person who enabled notifications, granted the browser permission and
 * saw "notifications on" is being told something untrue while the keys are
 * missing. Email says so at error level in production for the same reason.
 */
describe('web push configuration', () => {
  const ENV = { ...process.env }
  let errors: string[]
  let logs: string[]
  let spyError: jest.SpyInstance
  let spyLog: jest.SpyInstance

  const SUB = { endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' }
  const PAYLOAD = { title: 'A task was completed', body: 'x', url: '/' }

  beforeEach(() => {
    errors = []
    logs = []
    spyError = jest.spyOn(console, 'error').mockImplementation((...a) => { errors.push(a.join(' ')) })
    spyLog = jest.spyOn(console, 'log').mockImplementation((...a) => { logs.push(a.join(' ')) })
    jest.resetModules()
    process.env = { ...ENV }
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY
  })

  afterEach(() => {
    spyError.mockRestore()
    spyLog.mockRestore()
    process.env = { ...ENV }
  })

  // NODE_ENV is typed read-only, so set it through the env record.
  const setNodeEnv = (value: string) => {
    Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true })
  }

  const load = () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- keys are read per call, but the "warned once" latch is module state
    return require('@/lib/webpush') as typeof import('@/lib/webpush')
  }

  it('answers whether push can actually be sent', () => {
    const push = load()
    expect(push.isPushConfigured()).toBe(false)
    process.env.VAPID_PUBLIC_KEY = 'pub'
    process.env.VAPID_PRIVATE_KEY = 'priv'
    expect(push.isPushConfigured()).toBe(true)
  })

  it('is loud in production about dropping notifications', async () => {
    setNodeEnv('production')
    const push = load()

    await expect(push.sendPushNotification(SUB, PAYLOAD)).resolves.toBe('skipped')

    const said = errors.join('\n')
    expect(said).toContain('VAPID_PUBLIC_KEY')
    expect(said).toContain('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
    // Points at the fix and says what still works.
    expect(said).toContain('DEPLOY.md')
    expect(said).toContain('Email notifications are unaffected')
  })

  it('says it once, not once per subscriber', async () => {
    setNodeEnv('production')
    const push = load()

    for (let i = 0; i < 5; i++) await push.sendPushNotification(SUB, PAYLOAD)

    expect(errors.filter((line) => line.includes('VAPID keys are not configured'))).toHaveLength(1)
  })

  it('stays quiet in development, where push is normally not set up', async () => {
    setNodeEnv('development')
    const push = load()

    await expect(push.sendPushNotification(SUB, PAYLOAD)).resolves.toBe('skipped')

    expect(errors.join('\n')).not.toContain('VAPID')
    expect(logs.join('\n')).toContain('[push:dev]')
  })
})
