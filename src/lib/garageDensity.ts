/**
 * RL-035: cards or compact rows on the dashboard — a per-device display
 * choice, so localStorage like the theme, never a cookie or the account.
 * Every read and write is guarded: a private window or blocked site data
 * throws rather than returning null, and that must not break the garage.
 */
export const GARAGE_DENSITY_KEY = 'riglog-garage-density'
export const GARAGE_DENSITIES = ['cards', 'compact'] as const
export type GarageDensity = (typeof GARAGE_DENSITIES)[number]

export function readGarageDensity(storage: Pick<Storage, 'getItem'> | undefined): GarageDensity {
  try {
    return storage?.getItem(GARAGE_DENSITY_KEY) === 'compact' ? 'compact' : 'cards'
  } catch {
    return 'cards'
  }
}

export function writeGarageDensity(storage: Pick<Storage, 'setItem'> | undefined, density: GarageDensity): void {
  try {
    storage?.setItem(GARAGE_DENSITY_KEY, density)
  } catch {
    // Not remembered this time; the layout still switches.
  }
}
