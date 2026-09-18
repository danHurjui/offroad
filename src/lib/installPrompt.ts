/**
 * The install prompt is a browser affordance, not a link, and the rules
 * around it are unusual enough to be worth stating in one place.
 *
 * Chromium fires `beforeinstallprompt` when it decides the app is
 * installable and lets the page defer it. There is no way to ask for that
 * event — it either arrives or it does not — so a button rendered
 * unconditionally would do nothing on every browser that never fires one.
 *
 * Safari on iOS is the important such browser: it supports installing a
 * web app but only through Share → Add to Home Screen, with no API at all.
 * So iOS gets instructions where other browsers get a button.
 */

/** The bit of `BeforeInstallPromptEvent` we use; it is not in lib.dom. */
export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * iOS Safari, where installing is possible but only by hand.
 *
 * Matched on the platform rather than the browser, deliberately: every
 * browser on iOS is Safari underneath, so Chrome and Firefox there have
 * exactly the same limitation and need the same instructions.
 *
 * Takes its inputs rather than reading `navigator`, so the interesting
 * part — an iPad that claims to be a Mac — is testable without a browser
 * environment. The tests run under jest's node environment.
 */
export function isIosSafari(userAgent: string, maxTouchPoints: number): boolean {
  const ios = /iphone|ipad|ipod/i.test(userAgent)
  // iPadOS 13+ sends a desktop Safari user agent; touch points are what
  // give it away. Getting this wrong means iPads are offered nothing at
  // all, since they never fire an install prompt either.
  const iPadOs = /macintosh/i.test(userAgent) && maxTouchPoints > 1
  return ios || iPadOs
}

/**
 * Already running as an installed app, so there is nothing to offer.
 *
 * Reads the browser directly and is deliberately untested: it is two
 * feature reads or-ed together, both of which need a real browser to mean
 * anything, and the guards make it safe to call during the first render.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS reports it on navigator, everyone else through the media query.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true
}

/**
 * Where the pre-hydration capture parks the event, and the event it
 * raises to say so.
 */
export const INSTALL_PROMPT_GLOBAL = '__riglogInstallPrompt'
export const INSTALL_PROMPT_EVENT = 'riglog:installprompt'

/**
 * Catches `beforeinstallprompt` before React exists.
 *
 * Chromium fires it as soon as it decides the app is installable, which
 * is routinely *before* the page's own JavaScript has run — and a
 * listener attached in a `useEffect` cannot hear an event that already
 * happened. The event fires once and is not replayed, so the offer was
 * simply lost, silently, on exactly the fast-hydration-loses-the-race
 * basis that makes it look intermittent rather than broken.
 *
 * So this runs inline in `<head>`, like THEME_SCRIPT and for the same
 * class of reason: some things have to happen before the framework
 * boots. It parks the event on a global and raises a plain DOM event, so
 * a component mounting later can pick it up whichever side of the race
 * it lands on.
 *
 * `preventDefault()` is what suppresses Chromium's own mini-infobar and
 * hands the timing to the app — it has to happen on the event itself,
 * which is another reason this cannot wait for hydration.
 *
 * It is a string nothing type-checks, so `installPrompt.test.ts` executes
 * it for real against a stub window.
 */
export const INSTALL_PROMPT_SCRIPT = `(function(){try{
var w=window;
w.${INSTALL_PROMPT_GLOBAL}=null;
w.addEventListener('beforeinstallprompt',function(e){
e.preventDefault();
w.${INSTALL_PROMPT_GLOBAL}=e;
w.dispatchEvent(new Event('${INSTALL_PROMPT_EVENT}'));
});
w.addEventListener('appinstalled',function(){
w.${INSTALL_PROMPT_GLOBAL}=null;
w.dispatchEvent(new Event('${INSTALL_PROMPT_EVENT}'));
});
}catch(e){}})()`

type WindowWithPrompt = Window & { [INSTALL_PROMPT_GLOBAL]?: InstallPromptEvent | null }

/** Whatever the head script caught, if anything. */
export function readCapturedInstallPrompt(): InstallPromptEvent | null {
  if (typeof window === 'undefined') return null
  return (window as WindowWithPrompt)[INSTALL_PROMPT_GLOBAL] ?? null
}

/**
 * Drops the captured event.
 *
 * `prompt()` may be called once per event; the browser fires a fresh one
 * if it still considers the app installable. Leaving a spent event on the
 * global would offer a button that does nothing.
 */
export function clearCapturedInstallPrompt(): void {
  if (typeof window === 'undefined') return
  ;(window as WindowWithPrompt)[INSTALL_PROMPT_GLOBAL] = null
}
