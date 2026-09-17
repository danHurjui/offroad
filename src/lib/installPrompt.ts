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
