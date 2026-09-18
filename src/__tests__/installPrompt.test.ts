import {
  INSTALL_PROMPT_EVENT,
  INSTALL_PROMPT_GLOBAL,
  INSTALL_PROMPT_SCRIPT,
  clearCapturedInstallPrompt,
  isIosSafari,
  readCapturedInstallPrompt,
} from '@/lib/installPrompt'
import manifest from '../../public/manifest.json'

/**
 * The install offer disappears in two ways, and neither raises an error
 * anywhere: the browser decides the app is not installable and never
 * fires the event, or it fires it before the page's own JavaScript has
 * run and nothing is listening. These cover both.
 */

describe('the manifest meets the installability bar', () => {
  /**
   * Chromium requires a 192px and a 512px icon, and does not accept SVG
   * for this check — an SVG-only manifest is a valid manifest that is
   * simply never installable, so the button never appears and there is
   * nothing in any console to say why.
   */
  it('offers a 192 and a 512 PNG', () => {
    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons.find((i) => i.sizes === size && i.type === 'image/png')
      expect({ size, icon: icon?.src }).toMatchObject({ size, icon: expect.stringMatching(/\.png$/) })
    }
  })

  it('ships no SVG icon in the manifest', () => {
    // The favicon and the iOS home-screen icon are still SVG — those are
    // declared in the layout's metadata, where SVG works. Here it does
    // not, and one that is ignored is better left out than left to look
    // like it counts.
    expect(manifest.icons.every((i) => i.type === 'image/png')).toBe(true)
  })

  it('has a maskable icon so Android does not letterbox it', () => {
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true)
  })

  it('declares the other fields the check requires', () => {
    expect(manifest).toMatchObject({
      name: expect.stringMatching(/\S/),
      short_name: expect.stringMatching(/\S/),
      start_url: expect.stringMatching(/^\//),
      display: 'standalone',
    })
  })
})

/**
 * The capture script is a string nothing type-checks. Executing it is the
 * only way to know it works — the same reason theme.test.ts runs
 * THEME_SCRIPT for real.
 */
describe('the pre-hydration capture script', () => {
  function runScript() {
    const listeners: Record<string, ((e: unknown) => void)[]> = {}
    const dispatched: string[] = []
    const win = {
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        ;(listeners[type] ??= []).push(fn)
      },
      dispatchEvent: (e: { type: string }) => dispatched.push(e.type),
    } as unknown as Window
    // eslint-disable-next-line no-new-func
    new Function('window', 'Event', `${INSTALL_PROMPT_SCRIPT}`)(
      win,
      class { constructor(public type: string) {} }
    )
    return { win: win as unknown as Record<string, unknown>, listeners, dispatched }
  }

  it('runs without throwing and starts empty', () => {
    const { win } = runScript()
    expect(win[INSTALL_PROMPT_GLOBAL]).toBeNull()
  })

  it('keeps the event and says it has one', () => {
    const { win, listeners, dispatched } = runScript()
    const preventDefault = jest.fn()
    const event = { preventDefault, prompt: jest.fn() }

    listeners['beforeinstallprompt'][0](event)

    expect(win[INSTALL_PROMPT_GLOBAL]).toBe(event)
    // Without preventDefault, Chromium shows its own mini-infobar and the
    // app never gets to choose where the offer appears.
    expect(preventDefault).toHaveBeenCalled()
    expect(dispatched).toContain(INSTALL_PROMPT_EVENT)
  })

  it('lets it go once the app is installed', () => {
    const { win, listeners } = runScript()
    listeners['beforeinstallprompt'][0]({ preventDefault: jest.fn() })
    listeners['appinstalled'][0]({})
    expect(win[INSTALL_PROMPT_GLOBAL]).toBeNull()
  })
})

describe('reading the captured event', () => {
  // The tests run under jest's node environment, where there is no window
  // at all — the same guard that makes these safe to call during a server
  // render is what is being checked here.
  it('is safe where there is no window', () => {
    expect(readCapturedInstallPrompt()).toBeNull()
    expect(() => clearCapturedInstallPrompt()).not.toThrow()
  })
})

/**
 * A button rendered unconditionally would do nothing on every browser that
 * never fires `beforeinstallprompt` — which includes all of iOS, where
 * installing is possible but only by hand.
 */
describe('isIosSafari', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
  const IPAD_OLD = 'Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X) AppleWebKit/605.1.15'
  const IPAD_NEW = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
  const MAC = IPAD_NEW
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120'

  it('matches iPhone and older iPads', () => {
    expect(isIosSafari(IPHONE, 0)).toBe(true)
    expect(isIosSafari(IPAD_OLD, 0)).toBe(true)
  })

  it('matches an iPad that claims to be a Mac', () => {
    // iPadOS 13+ sends a desktop Safari UA; touch points are what give it
    // away, and getting this wrong means iPads see no instructions at all.
    expect(isIosSafari(IPAD_NEW, 5)).toBe(true)
  })

  it('does not match a real Mac', () => {
    expect(isIosSafari(MAC, 0)).toBe(false)
  })

  it('does not match Android, which gets a real prompt', () => {
    expect(isIosSafari(ANDROID, 5)).toBe(false)
  })
})
