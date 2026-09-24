/**
 * RON amounts, written the Romanian way: `14.999,50 RON` — a dot between
 * thousands, a comma before the bani. One helper, so an export and the
 * screen it came from print the same figure the same way (RL-041).
 *
 * The app printed `14.99 RON` in places and `14.999 RON` in others; since
 * #105 everything goes through here, and a test fails on a hand-built
 * `${…} RON` anywhere else.
 */

const formatters = new Map<number, Intl.NumberFormat>()

function formatter(decimals: number): Intl.NumberFormat {
  let f = formatters.get(decimals)
  if (!f) {
    f = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: true })
    formatters.set(decimals, f)
  }
  return f
}

/** The figure alone — `14.999,50` — for a column already headed "RON". */
export function formatAmount(amount: number, decimals: 0 | 2 = 2): string {
  // -0 would print as "-0,00".
  const value = Object.is(amount, -0) ? 0 : amount
  return formatter(decimals).format(value)
}

/** With its currency — `14.999,50 RON`. */
export function formatRon(amount: number, decimals: 0 | 2 = 2): string {
  return `${formatAmount(amount, decimals)} RON`
}
