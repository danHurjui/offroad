import { isIosSafari } from '@/lib/installPrompt'

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
