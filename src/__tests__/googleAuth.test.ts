import fs from 'fs'
import path from 'path'

const ORIGINAL_ENV = process.env

function env(vars: Record<string, string | undefined>) {
  process.env = { ...ORIGINAL_ENV }
  delete process.env.GOOGLE_CLIENT_ID
  delete process.env.GOOGLE_CLIENT_SECRET
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) process.env[k] = v
  }
}

afterAll(() => {
  process.env = ORIGINAL_ENV
})

describe('isGoogleAuthConfigured', () => {
  // Required fresh each time: authOptions is built at module load from the
  // environment, so the module has to be re-evaluated per case.
  const load = () => {
    let configured = false
    jest.isolateModules(() => {
      configured = (require('@/lib/auth') as typeof import('@/lib/auth')).isGoogleAuthConfigured()
    })
    return configured
  }

  it('is true only when both halves are present', () => {
    env({ GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'secret' })
    expect(load()).toBe(true)
  })

  /**
   * Half-configured is the dangerous case: a provider registered with an
   * empty client id still renders a button, which sends people to a Google
   * error page. That reads as "this app is broken" rather than "a setting
   * is missing".
   */
  it('is false when either half is missing or blank', () => {
    env({ GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com' })
    expect(load()).toBe(false)
    env({ GOOGLE_CLIENT_SECRET: 'secret' })
    expect(load()).toBe(false)
    env({ GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: 'secret' })
    expect(load()).toBe(false)
    env({})
    expect(load()).toBe(false)
  })
})

describe('provider registration', () => {
  const providerIds = () => {
    let ids: string[] = []
    jest.isolateModules(() => {
      const { authOptions } = require('@/lib/auth') as typeof import('@/lib/auth')
      ids = authOptions.providers.map((p) => p.id)
    })
    return ids
  }

  it('registers Google only when configured', () => {
    env({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })
    expect(providerIds()).toContain('google')

    env({})
    expect(providerIds()).not.toContain('google')
  })

  // Email/password must keep working regardless — Google is additive.
  it('always registers credentials', () => {
    env({})
    expect(providerIds()).toContain('credentials')
    env({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' })
    expect(providerIds()).toContain('credentials')
  })
})

/**
 * The sign-in callback matches a Google identity to an existing account by
 * email address. These are the properties that makes safe, asserted
 * against the source because the callback is not separable from NextAuth's
 * own plumbing.
 */
describe('the Google sign-in callback', () => {
  const AUTH = fs.readFileSync(path.join(process.cwd(), 'src', 'lib', 'auth.ts'), 'utf8')
  const CALLBACK = AUTH.slice(AUTH.indexOf('async signIn('), AUTH.indexOf('async jwt('))

  /**
   * Account takeover: the callback links by email, so accepting an address
   * Google itself reports as unverified would let anyone who can assert an
   * address claim the account that already owns it.
   */
  it('refuses an address Google reports as unverified', () => {
    expect(CALLBACK).toMatch(/email_verified/)
    expect(CALLBACK).toMatch(/email_verified\s*===\s*false/)
    // Refuses rather than continuing.
    const guard = CALLBACK.slice(CALLBACK.indexOf('email_verified'))
    expect(guard.slice(0, 400)).toMatch(/return false/)
  })

  // Credentials sign-up lowercases the address, so matching an untouched
  // Google address would create a duplicate account for the same person.
  it('normalises the address before matching an existing account', () => {
    expect(CALLBACK).toMatch(/toLowerCase\(\)/)
    expect(CALLBACK).toMatch(/findUnique\(\{ where: \{ email \} \}\)/)
  })

  it('creates the account through the shared founding-grant helper', () => {
    expect(CALLBACK).toMatch(/createUserWithFoundingGrant/)
  })

  // A generated username is what RL-018's public build URLs are built on;
  // a Google signup without one cannot publish a project.
  it('generates a username for a new Google account', () => {
    expect(CALLBACK).toMatch(/generateUsername/)
  })

  // Deactivation is the moderation lever, and it has to hold for OAuth too.
  it('refuses a deactivated account', () => {
    expect(CALLBACK).toMatch(/if \(!dbUser\.active\) return false/)
  })
})

describe('the Google button', () => {
  const BUTTON = fs.readFileSync(
    path.join(process.cwd(), 'src', 'components', 'GoogleSignInButton.tsx'),
    'utf8'
  )

  /**
   * It asks NextAuth what is registered rather than reading an env var:
   * these pages are client components, and a button kept in sync by hand
   * eventually is not.
   */
  it('derives its visibility from the registered providers', () => {
    expect(BUTTON).toMatch(/getProviders/)
    expect(BUTTON).toMatch(/providers\?\.google/)
    expect(BUTTON).toMatch(/if \(!available\) return null/)
  })

  it('is offered on both the login and signup pages', () => {
    for (const page of ['login', 'register']) {
      const source = fs.readFileSync(
        path.join(process.cwd(), 'src', 'app', page, 'page.tsx'),
        'utf8'
      )
      expect(source).toMatch(/GoogleSignInButton/)
    }
  })

  // The old unconditional button is gone from both pages.
  it('leaves no hardcoded Google button behind', () => {
    for (const page of ['login', 'register']) {
      const source = fs.readFileSync(
        path.join(process.cwd(), 'src', 'app', page, 'page.tsx'),
        'utf8'
      )
      expect(source).not.toMatch(/signIn\('google'/)
    }
  })
})
