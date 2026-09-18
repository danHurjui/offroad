import { REPORTED_VERSION_MAX, sanitizeReportedVersion } from '@/lib/version'

/**
 * The rule this module exists to keep: never print a version that is a
 * guess. A number shown here gets quoted back in a bug report as fact, so
 * "unknown" has to survive every refactor that would find a tidy default
 * for it.
 */

const ORIGINAL_ENV = process.env

/** Re-imports the module with a given build environment. */
async function load(env: Record<string, string | undefined>) {
  jest.resetModules()
  process.env = { ...ORIGINAL_ENV, ...env }
  return import('@/lib/version')
}

afterEach(() => {
  process.env = ORIGINAL_ENV
})

describe('what the app knows about itself', () => {
  it('reports the version and commit it was built with', async () => {
    const v = await load({
      NEXT_PUBLIC_APP_VERSION: '0.4.2',
      NEXT_PUBLIC_BUILD_SHA: 'a1b2c3d',
      NEXT_PUBLIC_BUILD_TIME: '2026-09-18T10:00:00.000Z',
    })
    expect(v.versionLabel()).toBe('0.4.2 · a1b2c3d')
    expect(v.isBuildKnown()).toBe(true)
    expect(v.buildId()).toBe('a1b2c3d')
  })

  it('says nothing rather than guessing when it knows nothing', async () => {
    const v = await load({
      NEXT_PUBLIC_APP_VERSION: '',
      NEXT_PUBLIC_BUILD_SHA: '',
      NEXT_PUBLIC_BUILD_TIME: '',
    })
    // null, so the caller renders its own translated sentence — this
    // module must not invent an English one for a bilingual app.
    expect(v.versionLabel()).toBeNull()
    expect(v.isBuildKnown()).toBe(false)
    expect(v.APP_VERSION).toBeNull()
    expect(v.BUILD_SHA).toBeNull()
  })

  it('treats an unset variable the same as an empty one', async () => {
    const v = await load({
      NEXT_PUBLIC_APP_VERSION: undefined,
      NEXT_PUBLIC_BUILD_SHA: undefined,
      NEXT_PUBLIC_BUILD_TIME: undefined,
    })
    expect(v.versionLabel()).toBeNull()
  })

  it('still shows the semver when only the commit is missing', async () => {
    const v = await load({ NEXT_PUBLIC_APP_VERSION: '0.4.2', NEXT_PUBLIC_BUILD_SHA: '' })
    expect(v.versionLabel()).toBe('0.4.2')
    // ...but does not claim to know *which build* that is.
    expect(v.isBuildKnown()).toBe(false)
  })
})

describe('the build id', () => {
  /**
   * The cache name and the update check key on this, so on a deployment
   * with no git history it still has to tell two builds apart — otherwise
   * the service worker never reinstalls and the stale-cache problem this
   * whole ticket is about comes straight back.
   */
  it('falls back to the build time, which still separates two builds', async () => {
    const first = await load({
      NEXT_PUBLIC_BUILD_SHA: '',
      NEXT_PUBLIC_BUILD_TIME: '2026-09-18T10:00:00.000Z',
    })
    const second = await load({
      NEXT_PUBLIC_BUILD_SHA: '',
      NEXT_PUBLIC_BUILD_TIME: '2026-09-18T10:05:00.000Z',
    })
    expect(first.buildId()).not.toBe(second.buildId())
  })

  it('is only "unknown" when there is genuinely nothing', async () => {
    const v = await load({ NEXT_PUBLIC_BUILD_SHA: '', NEXT_PUBLIC_BUILD_TIME: '' })
    expect(v.buildId()).toBe('unknown')
  })

  it('prefers the commit over the timestamp', async () => {
    const v = await load({
      NEXT_PUBLIC_BUILD_SHA: 'a1b2c3d',
      NEXT_PUBLIC_BUILD_TIME: '2026-09-18T10:00:00.000Z',
    })
    expect(v.buildId()).toBe('a1b2c3d')
  })
})

describe('a version reported by somebody else’s browser', () => {
  it('keeps the shape a version actually has', () => {
    expect(sanitizeReportedVersion('0.4.2 · a1b2c3d')).toBe('0.4.2 · a1b2c3d')
    expect(sanitizeReportedVersion('  0.4.2  ')).toBe('0.4.2')
  })

  it('refuses anything that is not a string, or is empty', () => {
    expect(sanitizeReportedVersion(undefined)).toBeNull()
    expect(sanitizeReportedVersion(null)).toBeNull()
    expect(sanitizeReportedVersion(42)).toBeNull()
    expect(sanitizeReportedVersion({ v: '1' })).toBeNull()
    expect(sanitizeReportedVersion('')).toBeNull()
    expect(sanitizeReportedVersion('   ')).toBeNull()
  })

  /**
   * It is rendered on an admin screen beside text the same person wrote,
   * so it is stripped to the characters a version can contain rather than
   * trusted because it looked plausible.
   */
  it('strips markup and anything else that is not version-shaped', () => {
    expect(sanitizeReportedVersion('<script>alert(1)</script>')).toBe('scriptalert1script')
    expect(sanitizeReportedVersion('0.4.2"><img src=x>')).toBe('0.4.2img srcx')
  })

  it('is bounded, so it cannot be used to write an essay into the row', () => {
    const long = 'a'.repeat(500)
    expect(sanitizeReportedVersion(long)).toHaveLength(REPORTED_VERSION_MAX)
  })

  it('does not turn a string of only junk into an empty label', () => {
    expect(sanitizeReportedVersion('<<<>>>')).toBeNull()
  })
})
