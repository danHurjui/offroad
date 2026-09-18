/**
 * The bot check's own failure modes, which are the whole point of it
 * having a module.
 *
 * Three of them decide whether a request is let through, and getting any
 * one backwards is either a hole (accepting what Cloudflare rejected) or
 * an outage (refusing everybody because a key is missing or a network hop
 * is down). None of the three is visible from the forms.
 */

import { isTurnstileConfigured, turnstileConfigProblem, verifyTurnstile } from '@/lib/turnstile'

// Both keys are read inside the functions rather than at module load, so
// these cases can move the environment around a single static import.
// That is not incidental: a module-level read would freeze whichever
// value the first import saw, and on Vercel that is the build's, not the
// deployment's.
const ORIGINAL_ENV = process.env

describe('turnstile configuration', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
    delete process.env.TURNSTILE_SECRET_KEY
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  it('is off when neither key is set', () => {
    expect(isTurnstileConfigured()).toBe(false)
    // Not a problem — deliberately unconfigured is a supported state.
    expect(turnstileConfigProblem()).toBeNull()
  })

  it('is on only when both keys are set', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site'
    process.env.TURNSTILE_SECRET_KEY = 'secret'
    expect(isTurnstileConfigured()).toBe(true)
    expect(turnstileConfigProblem()).toBeNull()
  })

  /**
   * A widget with no secret behind it would have to wave every token
   * through. That looks like protection to whoever set it up, which makes
   * it worse than none.
   */
  it('treats a site key without a secret as off, and names it', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site'
    expect(isTurnstileConfigured()).toBe(false)
    expect(turnstileConfigProblem()).toBe('secretMissing')
  })

  /**
   * The opposite half is the dangerous one: enforcing with no site key
   * would refuse every signup and login on the site, because no form can
   * render a widget or produce a token.
   */
  it('treats a secret without a site key as off, and names it', () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret'
    expect(isTurnstileConfigured()).toBe(false)
    expect(turnstileConfigProblem()).toBe('siteKeyMissing')
  })

  it('reads an empty string as unset rather than as a key', () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = ''
    process.env.TURNSTILE_SECRET_KEY = ''
    expect(isTurnstileConfigured()).toBe(false)
    expect(turnstileConfigProblem()).toBeNull()
  })
})

describe('verifyTurnstile', () => {
  let fetchMock: jest.Mock

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site'
    process.env.TURNSTILE_SECRET_KEY = 'secret'
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  const answers = (body: unknown, ok = true) =>
    fetchMock.mockResolvedValue({ ok, json: async () => body })

  it('does not call Cloudflare at all when the check is switched off', async () => {
    delete process.env.TURNSTILE_SECRET_KEY
    await expect(verifyTurnstile('anything')).resolves.toEqual({ ok: true, skipped: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a request carrying no token', async () => {
    expect(await verifyTurnstile(undefined)).toMatchObject({ ok: false, reason: 'missingToken' })
    expect(await verifyTurnstile('')).toMatchObject({ ok: false, reason: 'missingToken' })
    expect(await verifyTurnstile('   ')).toMatchObject({ ok: false, reason: 'missingToken' })
    // A non-string is what a hand-written request body produces.
    expect(await verifyTurnstile({ token: 'x' })).toMatchObject({ ok: false, reason: 'missingToken' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a token Cloudflare says is good', async () => {
    answers({ success: true })
    expect(await verifyTurnstile('tok')).toEqual({ ok: true, skipped: false })
  })

  /**
   * The one thing that must never be waved through: an answer, from
   * Cloudflare, saying no.
   */
  it('refuses a token Cloudflare rejects, and keeps its error codes', async () => {
    answers({ success: false, 'error-codes': ['timeout-or-duplicate'] })
    expect(await verifyTurnstile('tok')).toEqual({
      ok: false,
      reason: 'rejected',
      errorCodes: ['timeout-or-duplicate'],
    })
  })

  /**
   * Fails open, on purpose and for the same reason the rate limiter does:
   * failing closed would convert a Cloudflare outage into registration,
   * login and password reset being down for everybody.
   */
  it('lets the request through when Cloudflare cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    expect(await verifyTurnstile('tok')).toEqual({ ok: true, skipped: true })
  })

  it('lets the request through when Cloudflare answers with an error status', async () => {
    answers({}, false)
    expect(await verifyTurnstile('tok')).toEqual({ ok: true, skipped: true })
  })

  it('sends the secret and the token, and never the site key', async () => {
    answers({ success: true })
    await verifyTurnstile('tok', '203.0.113.9')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify')
    const sent = new URLSearchParams(String(init.body))
    expect(sent.get('secret')).toBe('secret')
    expect(sent.get('response')).toBe('tok')
    expect(sent.get('remoteip')).toBe('203.0.113.9')
  })

  /**
   * `clientIp()` answers 'unknown' when it has nothing. Cloudflare replies
   * `bad-request` to a malformed remoteip rather than ignoring it, which
   * would turn "we could not read the IP" into "this visitor is a bot".
   */
  it('omits remoteip when the address is not known', async () => {
    answers({ success: true })
    await verifyTurnstile('tok', 'unknown')
    const sent = new URLSearchParams(String(fetchMock.mock.calls[0][1].body))
    expect(sent.has('remoteip')).toBe(false)
  })
})
