import {
  CHORD_PREFIXES,
  SHORTCUTS,
  formatKeys,
  hasSystemModifier,
  isTypingTarget,
  matchShortcut,
  newHrefForPath,
} from '@/lib/shortcuts'

describe('SHORTCUTS', () => {
  it('has no two shortcuts on the same sequence', () => {
    const sequences = SHORTCUTS.map((s) => s.keys.join('+'))
    expect(new Set(sequences).size).toBe(sequences.length)
  })

  /**
   * If a single-key shortcut used a chord prefix, the prefix would win and
   * the single key could never fire — a shortcut that silently does nothing.
   */
  it('never binds a chord prefix as a single key', () => {
    for (const shortcut of SHORTCUTS) {
      if (shortcut.keys.length === 1) {
        expect(CHORD_PREFIXES).not.toContain(shortcut.keys[0])
      }
    }
  })

  it('derives its chord prefixes from the shortcut list', () => {
    expect(CHORD_PREFIXES).toEqual(['g'])
  })

  it('gives every "go to" shortcut somewhere to go', () => {
    for (const shortcut of SHORTCUTS.filter((s) => s.group === 'goTo')) {
      expect(shortcut.href).toMatch(/^\//)
    }
  })

  // The description lives in the catalogue now — i18n.test.ts checks both
  // languages have one. What has to hold here is that the id it is keyed
  // on is present and unique.
  it('gives every shortcut a distinct id to look its description up by', () => {
    const ids = SHORTCUTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id.trim().length).toBeGreaterThan(0)
  })
})

describe('matchShortcut', () => {
  it('matches a single key', () => {
    expect(matchShortcut(['?'])?.group).toBe('help')
    expect(matchShortcut(['n'])?.id).toBe('new')
  })

  it('matches a chord', () => {
    expect(matchShortcut(['g', 'd'])?.href).toBe('/dashboard')
    expect(matchShortcut(['g', 's'])?.href).toBe('/dashboard/settings')
  })

  it('returns null for an unknown sequence', () => {
    expect(matchShortcut(['z'])).toBeNull()
    expect(matchShortcut(['g', 'z'])).toBeNull()
    expect(matchShortcut([])).toBeNull()
  })

  // A chord's prefix alone must not resolve, or 'g' would fire on its own.
  it('does not match a chord prefix by itself', () => {
    expect(matchShortcut(['g'])).toBeNull()
  })

  it('is order-sensitive', () => {
    expect(matchShortcut(['d', 'g'])).toBeNull()
  })

  it('is case-sensitive, so Shift+D is not d', () => {
    expect(matchShortcut(['N'])).toBeNull()
    expect(matchShortcut(['G', 'D'])).toBeNull()
  })
})

describe('hasSystemModifier', () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false }

  it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('treats %s as the browser’s', (modifier) => {
    expect(hasSystemModifier({ ...base, [modifier]: true })).toBe(true)
  })

  it('allows a bare keystroke', () => {
    expect(hasSystemModifier(base)).toBe(false)
  })
})

/**
 * The important one: a shortcut firing mid-sentence in a notes field would
 * navigate away and lose what the user was typing.
 */
describe('isTypingTarget', () => {
  // No jsdom in this project, so stand in for the DOM classes the check
  // uses. `instanceof` needs real constructors, hence the shims.
  class FakeElement {
    tagName: string
    isContentEditable: boolean
    constructor(tagName: string, isContentEditable = false) {
      this.tagName = tagName.toUpperCase()
      this.isContentEditable = isContentEditable
    }
  }
  class FakeHTMLElement extends FakeElement {}

  // isTypingTarget only ever reads tagName/isContentEditable and the
  // instanceof checks; the rest of EventTarget is irrelevant here.
  const asTarget = (element: FakeElement) => element as unknown as EventTarget

  const globals = globalThis as unknown as { Element?: unknown; HTMLElement?: unknown }
  const originalElement = globals.Element
  const originalHtmlElement = globals.HTMLElement

  beforeAll(() => {
    globals.Element = FakeElement
    globals.HTMLElement = FakeHTMLElement
  })
  afterAll(() => {
    globals.Element = originalElement
    globals.HTMLElement = originalHtmlElement
  })

  it.each(['input', 'textarea', 'select', 'INPUT', 'TextArea'])('suppresses inside <%s>', (tag) => {
    expect(isTypingTarget(asTarget(new FakeHTMLElement(tag)))).toBe(true)
  })

  it('suppresses inside a contenteditable element', () => {
    expect(isTypingTarget(asTarget(new FakeHTMLElement('div', true)))).toBe(true)
  })

  it('allows a plain element', () => {
    expect(isTypingTarget(asTarget(new FakeHTMLElement('div')))).toBe(false)
    expect(isTypingTarget(asTarget(new FakeHTMLElement('button')))).toBe(false)
  })

  // document itself is the target when nothing is focused.
  it('allows a non-element target', () => {
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget({} as EventTarget)).toBe(false)
  })
})

describe('newHrefForPath', () => {
  it('adds a task when you are on a vehicle', () => {
    expect(newHrefForPath('/dashboard/vehicles/abc123')).toBe('/dashboard/vehicles/abc123/tasks/new')
    expect(newHrefForPath('/dashboard/vehicles/abc123/photos')).toBe('/dashboard/vehicles/abc123/tasks/new')
    expect(newHrefForPath('/dashboard/vehicles/abc123/wishlist/item1')).toBe(
      '/dashboard/vehicles/abc123/tasks/new'
    )
  })

  // /dashboard/vehicles/new is the create form, not a vehicle called "new".
  it('does not treat the create form as a vehicle', () => {
    expect(newHrefForPath('/dashboard/vehicles/new')).toBe('/dashboard/vehicles/new')
  })

  it('adds a vehicle from anywhere else', () => {
    for (const path of ['/dashboard', '/dashboard/settings', '/community', '/tickets', '/', null, undefined]) {
      expect(newHrefForPath(path)).toBe('/dashboard/vehicles/new')
    }
  })
})

describe('formatKeys', () => {
  it('reads a chord out loud', () => {
    expect(formatKeys(['g', 'd'])).toBe('g then d')
    expect(formatKeys(['?'])).toBe('?')
  })
})
