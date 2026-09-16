'use client'

/**
 * A RON amount. Every cost field in the app goes through this so they can't
 * drift apart on the details that matter:
 *
 * - `inputMode="decimal"` — on a phone this is the difference between a
 *   numeric keypad and the full alphabetic keyboard.
 * - `min={0}` — costs are stored as unsigned Decimals and the API rejects a
 *   negative (see parseAmount); the browser should say so first.
 * - `step="0.01"` — bani. Without it the spinner jumps by whole lei and
 *   Firefox marks "49.90" invalid.
 * - `autoComplete="off"` — otherwise the browser offers a saved postcode.
 *
 * The suffix is decoration (`aria-hidden`); the visible label carries the
 * currency for anyone who can't see it.
 */
export default function MoneyInput({
  id,
  value,
  onChange,
  placeholder = '0.00',
  required = false,
  describedBy,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  required?: boolean
  describedBy?: string
}) {
  return (
    <div className="relative">
      <input
        id={id}
        name={id}
        type="number"
        className="input pr-12"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        step="0.01"
        min={0}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        aria-describedby={describedBy}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-xs font-medium text-ink-faint"
      >
        RON
      </span>
    </div>
  )
}
