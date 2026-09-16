/**
 * Theme preference: an explicit user choice, or "system" to follow the OS.
 *
 * Stored in localStorage rather than a cookie on purpose — it is a per-device
 * display preference, nothing to do with the account, and keeping it out of
 * cookies means it isn't personal data and doesn't need a consent story
 * (see /cookies).
 */

export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'riglog-theme'

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

/**
 * Inlined into <head> and run before first paint, so a dark-theme user
 * never sees a white flash while React hydrates. Deliberately tiny, with
 * no imports, and wrapped in try/catch: a blocked localStorage (private
 * mode, cleared site data) must degrade to the system theme rather than
 * throw and take the page down.
 */
export const THEME_SCRIPT = `(function(){try{
var s=localStorage.getItem('${THEME_STORAGE_KEY}');
var d=s==='dark'||((s===null||s==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',d);
document.documentElement.style.colorScheme=d?'dark':'light';
}catch(e){}})();`

/** Applies a preference to <html> and remembers it. */
export function applyTheme(preference: ThemePreference): void {
  const prefersDark =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = preference === 'dark' || (preference === 'system' && prefersDark)

  document.documentElement.classList.toggle('dark', dark)
  // Tells the browser to theme its own chrome — scrollbars, form controls,
  // the autofill background — which CSS variables alone don't reach.
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'

  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Non-fatal: the theme still applies for this page view.
  }
}

export function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : 'system'
  } catch {
    return 'system'
  }
}
