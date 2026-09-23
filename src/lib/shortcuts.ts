/**
 * Keyboard shortcuts for the signed-in app.
 *
 * Two shapes, both borrowed from the conventions people already know from
 * GitHub/Linear/Gmail rather than invented here:
 *
 * - **Chords**: `g` then a letter, for "go to". A leading key means the
 *   single letters stay free for actions and nothing needs a modifier,
 *   which matters because Ctrl/Cmd combinations are almost all claimed by
 *   the browser already.
 * - **Single keys**: one-off actions (`n` new, `/` search, `?` help).
 *
 * The matching logic lives here, apart from React, because "does this
 * keystroke count?" is the part worth testing — and getting it wrong means
 * a shortcut fires while someone is typing a note.
 */

export type ShortcutGroup = 'goTo' | 'actions' | 'help'

export interface Shortcut {
  /**
   * Stable identifier, and the catalogue key its description is looked up
   * under (`shortcuts.item.<id>`). The description is not stored here for
   * the same reason a category's label is not stored in
   * PROJECT_TYPE_CONFIG: it has to be readable in two languages, and the
   * key sequence must not change when the wording does.
   */
  id: string
  /** Key sequence: ['g', 'd'] for a chord, ['n'] for a single key. */
  keys: string[]
  group: ShortcutGroup
  /** Where it takes you. Omitted for shortcuts handled specially. */
  href?: string
}

/** The order the help sheet lists its sections in. */
/**
 * Raised by `u`; the toast layer (src/components/Toaster.tsx) owns what it
 * means — undo the newest removal still inside its window. An event
 * rather than an import keeps this module free of React.
 */
export const UNDO_EVENT = 'riglog:undo'

export const SHORTCUT_GROUPS: ShortcutGroup[] = ['goTo', 'actions', 'help']

export const SHORTCUTS: Shortcut[] = [
  { id: 'dashboard', keys: ['g', 'd'], group: 'goTo', href: '/dashboard' },
  { id: 'community', keys: ['g', 'c'], group: 'goTo', href: '/community' },
  { id: 'partsWanted', keys: ['g', 'w'], group: 'goTo', href: '/community/parts-wanted' },
  { id: 'feedback', keys: ['g', 'f'], group: 'goTo', href: '/tickets' },
  { id: 'settings', keys: ['g', 's'], group: 'goTo', href: '/dashboard/settings' },
  { id: 'new', keys: ['n'], group: 'actions' },
  { id: 'search', keys: ['/'], group: 'actions' },
  { id: 'undo', keys: ['u'], group: 'actions' },
  { id: 'showList', keys: ['?'], group: 'help' },
  { id: 'close', keys: ['Escape'], group: 'help' },
]

/** How long a chord's first key stays armed before it is forgotten. */
export const CHORD_TIMEOUT_MS = 1200

/**
 * Whether a keystroke landed somewhere the user is composing text. A
 * shortcut that fires while someone types "notes" into a textarea — `n`
 * navigating away mid-sentence — is worse than having no shortcuts.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false

  const tag = target.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true

  // contenteditable, including `contenteditable="true"` on an ancestor.
  if (target instanceof HTMLElement && target.isContentEditable) return true

  return false
}

/**
 * Whether the event carries a modifier that means it belongs to the browser
 * or the OS (Cmd+D is a bookmark, not "go to dashboard"). Shift is not in
 * the list: `?` is Shift+/ on most layouts.
 */
export function hasSystemModifier(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
  return event.ctrlKey || event.metaKey || event.altKey
}

/** The keys that open a chord — currently just `g`. */
export const CHORD_PREFIXES = Array.from(
  new Set(SHORTCUTS.filter((s) => s.keys.length > 1).map((s) => s.keys[0]))
)

/** The shortcut matching a completed sequence, or null. */
export function matchShortcut(sequence: string[]): Shortcut | null {
  return (
    SHORTCUTS.find(
      (s) => s.keys.length === sequence.length && s.keys.every((k, i) => k === sequence[i])
    ) ?? null
  )
}

/** Human-readable form for the help dialog: ['g','d'] → 'g then d'. */
export function formatKeys(keys: string[]): string {
  return keys.join(' then ')
}

/**
 * A custom DOM event, so a button anywhere in the tree can open the help
 * sheet that KeyboardShortcuts owns. Cheaper than threading a context
 * through the layout for one boolean, and it keeps the header component
 * from needing to know the dialog exists.
 */
export const OPEN_SHORTCUTS_EVENT = 'riglog:open-shortcuts'

/**
 * What "new" means from a given path. Shared by the `n` shortcut and the
 * header's + button so the key and the button can't disagree.
 *
 * On any page under a specific vehicle, the likely thing is a task on that
 * vehicle; everywhere else it's a new vehicle. `/dashboard/vehicles/new` is
 * the create form itself, not a vehicle id.
 */
export function newHrefForPath(pathname: string | null | undefined): string {
  const match = pathname?.match(/^\/dashboard\/vehicles\/([^/]+)/)
  if (match && match[1] !== 'new') return `/dashboard/vehicles/${match[1]}/tasks/new`
  return '/dashboard/vehicles/new'
}
