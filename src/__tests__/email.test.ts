import {
  sendEmail,
  isEmailConfigured,
  emailProvider,
  parseSender,
  passwordResetEmailHtml,
} from '@/lib/email'

const ORIGINAL_ENV = process.env
const mockFetch = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  process.env = { ...ORIGINAL_ENV }
  delete process.env.BREVO_API_KEY
  delete process.env.RESEND_API_KEY
  delete process.env.EMAIL_FROM
  global.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockResolvedValue({ ok: true, status: 201, text: async () => '' })
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterAll(() => {
  process.env = ORIGINAL_ENV
})

const MESSAGE = { to: 'dan@example.com', subject: 'Reset your RigLog password', html: '<p>hi</p>' }

describe('provider selection', () => {
  it('reports nothing configured when neither key is set', () => {
    expect(emailProvider()).toBeNull()
    expect(isEmailConfigured()).toBe(false)
  })

  it('uses Brevo when only BREVO_API_KEY is set', () => {
    process.env.BREVO_API_KEY = 'xkeysib-test'
    expect(emailProvider()).toBe('brevo')
    expect(isEmailConfigured()).toBe(true)
  })

  it('uses Resend when only RESEND_API_KEY is set', () => {
    process.env.RESEND_API_KEY = 're_test'
    expect(emailProvider()).toBe('resend')
  })

  // Brevo wins so that adding its key is enough to switch — you don't have
  // to remember to clear the old one first.
  it('prefers Brevo when both are set', () => {
    process.env.BREVO_API_KEY = 'xkeysib-test'
    process.env.RESEND_API_KEY = 're_test'
    expect(emailProvider()).toBe('brevo')
  })
})

describe('parseSender', () => {
  it.each([
    ['RigLog <no-reply@riglog.ro>', { name: 'RigLog', email: 'no-reply@riglog.ro' }],
    ['  RigLog   <  a@b.com  >  ', { name: 'RigLog', email: 'a@b.com' }],
    ['"RigLog Support" <a@b.com>', { name: 'RigLog Support', email: 'a@b.com' }],
    ['<a@b.com>', { email: 'a@b.com' }],
    ['a@b.com', { email: 'a@b.com' }],
    ['  a@b.com  ', { email: 'a@b.com' }],
  ])('parses %s', (input, expected) => {
    expect(parseSender(input)).toEqual(expected)
  })
})

describe('sending via Brevo', () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = 'xkeysib-test'
    process.env.EMAIL_FROM = 'RigLog <no-reply@riglog.ro>'
  })

  it('posts to the Brevo transactional endpoint', async () => {
    await sendEmail(MESSAGE)
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.brevo.com/v3/smtp/email')
  })

  // Brevo authenticates with its own header, not a Bearer token.
  it('authenticates with the api-key header, not Authorization', async () => {
    await sendEmail(MESSAGE)
    const { headers } = mockFetch.mock.calls[0][1]
    expect(headers['api-key']).toBe('xkeysib-test')
    expect(headers.Authorization).toBeUndefined()
  })

  it('sends Brevo’s body shape', async () => {
    await sendEmail(MESSAGE)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body).toEqual({
      sender: { name: 'RigLog', email: 'no-reply@riglog.ro' },
      to: [{ email: 'dan@example.com' }],
      subject: MESSAGE.subject,
      htmlContent: MESSAGE.html,
    })
  })

  it('falls back to the default sender when EMAIL_FROM is unset', async () => {
    delete process.env.EMAIL_FROM
    await sendEmail(MESSAGE)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.sender.email).toBe('no-reply@riglog.ro')
  })

  it('resolves when Brevo accepts', async () => {
    await expect(sendEmail(MESSAGE)).resolves.toBeUndefined()
  })

  // The most likely real failure: the sender isn't verified in Brevo.
  it('throws and logs the provider reason on rejection', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"code":"invalid_parameter","message":"sender not valid"}',
    })
    await expect(sendEmail(MESSAGE)).rejects.toThrow(/brevo send failed: 400/)
    const logged = (console.error as jest.Mock).mock.calls[0][0]
    expect(logged).toMatch(/sender not valid/)
    expect(logged).toMatch(/verified sender/)
  })

  it('throws a clear error when Brevo is unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))
    await expect(sendEmail(MESSAGE)).rejects.toThrow('Could not reach the email provider')
  })
})

describe('sending via Resend still works', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.EMAIL_FROM = 'RigLog <no-reply@riglog.ro>'
  })

  it('posts to Resend with a Bearer token and its own body shape', async () => {
    await sendEmail(MESSAGE)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_test')
    expect(JSON.parse(init.body)).toEqual({
      from: 'RigLog <no-reply@riglog.ro>',
      to: 'dan@example.com',
      subject: MESSAGE.subject,
      html: MESSAGE.html,
    })
  })
})

describe('with no provider configured', () => {
  // NODE_ENV is typed read-only, so set it through the env record.
  const setNodeEnv = (value: string) => {
    Object.defineProperty(process.env, 'NODE_ENV', { value, configurable: true })
  }

  it('logs to the console in development and sends nothing', async () => {
    setNodeEnv('development')
    await sendEmail(MESSAGE)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalled()
  })

  // Silent data loss from the user's point of view, so it is an error-level
  // log naming the fix — not a quiet no-op.
  it('logs an error in production and sends nothing', async () => {
    setNodeEnv('production')
    await sendEmail(MESSAGE)
    expect(mockFetch).not.toHaveBeenCalled()
    expect((console.error as jest.Mock).mock.calls[0][0]).toMatch(/BREVO_API_KEY/)
  })
})

describe('passwordResetEmailHtml', () => {
  it('embeds the reset link', () => {
    const html = passwordResetEmailHtml('https://riglog.example/reset-password?token=abc')
    expect(html).toContain('href="https://riglog.example/reset-password?token=abc"')
  })
})
