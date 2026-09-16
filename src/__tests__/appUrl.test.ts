import {
  AppUrlNotConfiguredError,
  appUrlForMetadata,
  appUrlForNotification,
  requireAppUrl,
  resolveAppUrl,
} from '@/lib/appUrl'

const ORIGINAL_ENV = process.env

function env(vars: Record<string, string | undefined>, nodeEnv = 'production') {
  process.env = { ...ORIGINAL_ENV }
  for (const key of ['NEXTAUTH_URL', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    delete process.env[key]
  }
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  // NODE_ENV is typed read-only, so set it through the record.
  Object.defineProperty(process.env, 'NODE_ENV', { value: nodeEnv, configurable: true })
}

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {})
})
afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('resolveAppUrl', () => {
  it('uses NEXTAUTH_URL when it is a real origin', () => {
    env({ NEXTAUTH_URL: 'https://riglog.ro' })
    expect(resolveAppUrl()).toBe('https://riglog.ro')
  })

  it('normalises to the origin, dropping a path and trailing slash', () => {
    env({ NEXTAUTH_URL: 'https://riglog.ro/' })
    expect(resolveAppUrl()).toBe('https://riglog.ro')
    // A stray path would be doubled into every link built from it.
    env({ NEXTAUTH_URL: 'https://riglog.ro/app' })
    expect(resolveAppUrl()).toBe('https://riglog.ro')
  })

  it('trims surrounding whitespace, which pasted env values carry', () => {
    env({ NEXTAUTH_URL: '  https://riglog.ro  ' })
    expect(resolveAppUrl()).toBe('https://riglog.ro')
  })

  /**
   * The bug from issue #21. `NEXTAUTH_URL` held a base64 secret, so reset
   * emails linked to `http://drrisq1f…echq=/reset-password?token=…`. The
   * WHATWG URL parser accepts that as a hostname without complaint, which
   * is why there is an explicit hostname check rather than a try/catch
   * around `new URL()`.
   */
  it('rejects a secret pasted into the URL variable', () => {
    env({ NEXTAUTH_URL: 'http://drrisq1fjf7wq1wvgpz4of8ui4jhxndssowkzroechq=' })
    expect(resolveAppUrl()).toBeNull()
  })

  it('rejects other things that parse but are not hosts', () => {
    for (const bad of [
      'http://has space',
      'http://under_score',
      'http://-leading-dash.com',
      'http://trailing-dash-.com',
      'ftp://riglog.ro',
      'javascript:alert(1)',
      'riglog.ro',
      'not a url',
      '',
      '   ',
    ]) {
      env({ NEXTAUTH_URL: bad })
      expect(resolveAppUrl()).toBeNull()
    }
  })

  it('accepts localhost with a port, and an IP', () => {
    env({ NEXTAUTH_URL: 'http://localhost:3000' })
    expect(resolveAppUrl()).toBe('http://localhost:3000')
    env({ NEXTAUTH_URL: 'http://127.0.0.1:3000' })
    expect(resolveAppUrl()).toBe('http://127.0.0.1:3000')
  })

  describe('Vercel fallbacks', () => {
    // Platform-provided, so they cannot be spoofed by a request — unlike
    // the Host header, which is how reset-link poisoning works.
    it('falls back to the production alias, adding the scheme', () => {
      env({ VERCEL_PROJECT_PRODUCTION_URL: 'riglog.vercel.app' })
      expect(resolveAppUrl()).toBe('https://riglog.vercel.app')
    })

    it('falls back to VERCEL_URL last', () => {
      env({ VERCEL_URL: 'riglog-abc123.vercel.app' })
      expect(resolveAppUrl()).toBe('https://riglog-abc123.vercel.app')
    })

    /**
     * VERCEL_URL is the per-deployment hostname and changes on every push,
     * so a link built from it dies when the next deploy lands. The stable
     * production alias has to win.
     */
    it('prefers the stable production alias over the per-deploy hostname', () => {
      env({
        VERCEL_PROJECT_PRODUCTION_URL: 'riglog.ro',
        VERCEL_URL: 'riglog-abc123.vercel.app',
      })
      expect(resolveAppUrl()).toBe('https://riglog.ro')
    })

    it('still prefers an explicit NEXTAUTH_URL over both', () => {
      env({
        NEXTAUTH_URL: 'https://custom.example',
        VERCEL_PROJECT_PRODUCTION_URL: 'riglog.ro',
        VERCEL_URL: 'riglog-abc123.vercel.app',
      })
      expect(resolveAppUrl()).toBe('https://custom.example')
    })

    // A bad NEXTAUTH_URL must not shadow a good platform value.
    it('skips past an invalid NEXTAUTH_URL to a usable fallback', () => {
      env({
        NEXTAUTH_URL: 'http://drrisq1fjf7wq1wvgpz4of8ui4jhxndssowkzroechq=',
        VERCEL_PROJECT_PRODUCTION_URL: 'riglog.ro',
      })
      expect(resolveAppUrl()).toBe('https://riglog.ro')
    })
  })

  describe('when nothing is configured', () => {
    it('falls back to localhost in development', () => {
      env({}, 'development')
      expect(resolveAppUrl()).toBe('http://localhost:3000')
    })

    /**
     * No silent localhost in production: an email linking to localhost is
     * worse than one that was never sent, because it looks like it worked.
     */
    it('returns null in production', () => {
      env({}, 'production')
      expect(resolveAppUrl()).toBeNull()
    })
  })
})

describe('requireAppUrl', () => {
  it('returns the origin when one is configured', () => {
    env({ NEXTAUTH_URL: 'https://riglog.ro' })
    expect(requireAppUrl()).toBe('https://riglog.ro')
  })

  it('throws a message naming the variable and what it should hold', () => {
    env({}, 'production')
    expect(() => requireAppUrl()).toThrow(AppUrlNotConfiguredError)
    expect(() => requireAppUrl()).toThrow(/NEXTAUTH_URL/)
  })
})

describe('appUrlForNotification', () => {
  it('returns the origin when configured', () => {
    env({ NEXTAUTH_URL: 'https://riglog.ro' })
    expect(appUrlForNotification('the reset email')).toBe('https://riglog.ro')
    expect(console.error).not.toHaveBeenCalled()
  })

  // The old failure left no trace anywhere; that is the thing being fixed.
  it('returns null and says which notification was skipped', () => {
    env({}, 'production')
    expect(appUrlForNotification('the price-alert notification')).toBeNull()
    expect((console.error as jest.Mock).mock.calls[0][0]).toMatch(/price-alert notification/)
  })
})

describe('appUrlForMetadata', () => {
  it('never returns null — a sitemap that throws is worse than a wrong one', () => {
    env({}, 'production')
    expect(appUrlForMetadata()).toBe('http://localhost:3000')
    env({ NEXTAUTH_URL: 'https://riglog.ro' })
    expect(appUrlForMetadata()).toBe('https://riglog.ro')
  })
})

/**
 * The reason this module exists: fourteen call sites each wrote
 * `process.env.NEXTAUTH_URL ?? 'http://localhost:3000'`, so one bad
 * variable broke password resets, invitations, notifications, Stripe
 * redirects and the sitemap at once, silently.
 */
describe('no call site builds its own base URL', () => {
  const fs = jest.requireActual('fs') as typeof import('fs')
  const path = jest.requireActual('path') as typeof import('path')

  function sources(dir: string): string[] {
    const out: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === '__tests__') continue
        out.push(...sources(full))
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full)
      }
    }
    return out
  }

  it('reads NEXTAUTH_URL only inside appUrl.ts', () => {
    const offenders = sources(path.join(process.cwd(), 'src'))
      .filter((file) => !file.endsWith(path.join('lib', 'appUrl.ts')))
      .filter((file) => fs.readFileSync(file, 'utf8').includes('process.env.NEXTAUTH_URL'))
      .map((file) => path.relative(process.cwd(), file))

    expect(offenders).toEqual([])
  })
})
