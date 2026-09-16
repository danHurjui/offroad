import { NextResponse } from 'next/server'

/**
 * Money and physical-quantity inputs used to be coerced straight through
 * `Number(x)`, which accepts a negative ("-5000" is a valid number) and
 * turns a typo into `NaN` (stored as null, silently losing the value).
 * A negative cost then flows into the analytics totals and the PDF
 * exports, where it reads as a refund nobody entered.
 *
 * These fields are all non-negative by definition — a part costs 0 or
 * more, an odometer reads 0 or more — so validate them up front and
 * reject rather than coerce.
 */

/** True when `value` is absent (treated as "not provided"). */
function isAbsent(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/**
 * Returns the parsed amount, `null` when the field was not provided, or
 * `undefined` when the value is present but not a valid non-negative
 * finite number.
 */
export function parseAmount(value: unknown): number | null | undefined {
  if (isAbsent(value)) return null
  // Only a number or a numeric string is a cost. `Number()` alone would
  // also accept `[1]` (coerces to 1), `true` (1) and `[]` (0).
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

/**
 * Validates a group of optional non-negative numeric fields. Returns a 400
 * naming the offending field, or null when every field is acceptable:
 *
 *   const bad = invalidAmountResponse({ costRon, partsCostRon })
 *   if (bad) return bad
 */
export function invalidAmountResponse(fields: Record<string, unknown>): NextResponse | null {
  for (const [name, value] of Object.entries(fields)) {
    if (parseAmount(value) === undefined) {
      return NextResponse.json(
        { error: `${name} must be a non-negative number` },
        { status: 400 },
      )
    }
  }
  return null
}
