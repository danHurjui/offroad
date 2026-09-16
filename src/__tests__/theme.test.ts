import vm from 'vm'
import {
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  applyTheme,
  isThemePreference,
  readStoredTheme,
} from '@/lib/theme'

/**
 * There is no jsdom in this project (testEnvironment is 'node' — see
 * jest.config.js), so the few browser APIs the theme touches are stubbed by
 * hand. That keeps the surface honest: if theme.ts starts reaching for
 * something else, these tests fail rather than silently passing.
 */
// The globals theme.ts reaches for, declared once so nothing needs `any`.
const browser = globalThis as unknown as {
  document?: unknown
  window?: unknown
  localStorage?: unknown
}

type Stub = {
  classes: Set<string>
  colorScheme: string
  store: Map<string, string>
}

function installBrowser({ prefersDark = false, storageThrows = false } = {}): Stub {
  const stub: Stub = { classes: new Set(), colorScheme: '', store: new Map() }

  const classList = {
    toggle: (name: string, force: boolean) => {
      if (force) stub.classes.add(name)
      else stub.classes.delete(name)
    },
    contains: (name: string) => stub.classes.has(name),
  }

  browser.document = {
    documentElement: { classList, style: { set colorScheme(v: string) { stub.colorScheme = v } , get colorScheme() { return stub.colorScheme } } },
  }
  browser.window = {
    matchMedia: (query: string) => ({ matches: query.includes('dark') && prefersDark }),
  }
  browser.localStorage = {
    getItem: (k: string) => {
      if (storageThrows) throw new Error('blocked')
      return stub.store.has(k) ? stub.store.get(k)! : null
    },
    setItem: (k: string, v: string) => {
      if (storageThrows) throw new Error('blocked')
      stub.store.set(k, v)
    },
  }

  return stub
}

afterEach(() => {
  delete browser.document
  delete browser.window
  delete browser.localStorage
})

describe('isThemePreference', () => {
  it.each(['light', 'dark', 'system'])('accepts %s', (v) => {
    expect(isThemePreference(v)).toBe(true)
  })

  it.each([null, undefined, '', 'DARK', 'auto', 0, {}])('rejects %p', (v) => {
    expect(isThemePreference(v)).toBe(false)
  })
})

describe('readStoredTheme', () => {
  it('defaults to system when nothing is stored', () => {
    installBrowser()
    expect(readStoredTheme()).toBe('system')
  })

  it('returns a stored preference', () => {
    const stub = installBrowser()
    stub.store.set(THEME_STORAGE_KEY, 'dark')
    expect(readStoredTheme()).toBe('dark')
  })

  // A value someone hand-edited in devtools must not become a class name.
  it('falls back to system for a junk stored value', () => {
    const stub = installBrowser()
    stub.store.set(THEME_STORAGE_KEY, 'neon')
    expect(readStoredTheme()).toBe('system')
  })

  it('falls back to system when localStorage is blocked', () => {
    installBrowser({ storageThrows: true })
    expect(readStoredTheme()).toBe('system')
  })
})

describe('applyTheme', () => {
  it('adds the dark class and remembers the choice', () => {
    const stub = installBrowser()
    applyTheme('dark')
    expect(stub.classes.has('dark')).toBe(true)
    expect(stub.colorScheme).toBe('dark')
    expect(stub.store.get(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('removes the dark class for light', () => {
    const stub = installBrowser({ prefersDark: true })
    applyTheme('dark')
    applyTheme('light')
    expect(stub.classes.has('dark')).toBe(false)
    expect(stub.colorScheme).toBe('light')
    expect(stub.store.get(THEME_STORAGE_KEY)).toBe('light')
  })

  // "system" is a stored preference in its own right, not the absence of one:
  // it has to survive a reload so the toggle still shows three states.
  it('stores system and resolves it against the OS', () => {
    const dark = installBrowser({ prefersDark: true })
    applyTheme('system')
    expect(dark.classes.has('dark')).toBe(true)
    expect(dark.store.get(THEME_STORAGE_KEY)).toBe('system')

    const light = installBrowser({ prefersDark: false })
    applyTheme('system')
    expect(light.classes.has('dark')).toBe(false)
  })

  // The theme must still apply for this page view even if it can't be saved.
  it('still themes the page when localStorage is blocked', () => {
    const stub = installBrowser({ storageThrows: true })
    expect(() => applyTheme('dark')).not.toThrow()
    expect(stub.classes.has('dark')).toBe(true)
  })
})

/**
 * THEME_SCRIPT is inlined into <head> as a string, so nothing type-checks it.
 * Running it for real is the only way to know it works — and a throw here
 * would be a blank page in production, not just a wrong colour.
 */
describe('THEME_SCRIPT (the inline no-flash script)', () => {
  function run({ stored, prefersDark = false, storageThrows = false }:
    { stored?: string; prefersDark?: boolean; storageThrows?: boolean }) {
    const classes = new Set<string>()
    const element = {
      classList: {
        toggle: (n: string, f: boolean) => (f ? classes.add(n) : classes.delete(n)),
      },
      style: { colorScheme: '' },
    }
    const context = {
      document: { documentElement: element },
      window: { matchMedia: (q: string) => ({ matches: q.includes('dark') && prefersDark }) },
      localStorage: {
        getItem: () => {
          if (storageThrows) throw new Error('blocked')
          return stored ?? null
        },
      },
    }
    vm.createContext(context)
    vm.runInContext(THEME_SCRIPT, context)
    return { dark: classes.has('dark'), colorScheme: element.style.colorScheme }
  }

  it('applies dark for a stored dark preference', () => {
    expect(run({ stored: 'dark' })).toEqual({ dark: true, colorScheme: 'dark' })
  })

  it('applies light for a stored light preference even when the OS is dark', () => {
    expect(run({ stored: 'light', prefersDark: true })).toEqual({ dark: false, colorScheme: 'light' })
  })

  it('follows the OS when the preference is system', () => {
    expect(run({ stored: 'system', prefersDark: true }).dark).toBe(true)
    expect(run({ stored: 'system', prefersDark: false }).dark).toBe(false)
  })

  it('follows the OS for a first-time visitor with nothing stored', () => {
    expect(run({ prefersDark: true }).dark).toBe(true)
  })

  // Private browsing / blocked site data: degrade to light, never throw.
  it('does not throw when localStorage is unavailable', () => {
    expect(() => run({ storageThrows: true })).not.toThrow()
    expect(run({ storageThrows: true }).dark).toBe(false)
  })

  // It runs before anything else on the page; a syntax error is fatal.
  it('is syntactically valid on its own', () => {
    expect(() => new vm.Script(THEME_SCRIPT)).not.toThrow()
  })
})
