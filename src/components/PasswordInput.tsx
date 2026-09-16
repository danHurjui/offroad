'use client'

import { useState } from 'react'

/**
 * A password field with a reveal toggle. On a phone — which is most of this
 * app's traffic — typing a long password blind into a tiny keyboard is the
 * single most common reason people give up at the login screen.
 *
 * `autoComplete` is required rather than optional: getting it wrong is what
 * stops a password manager saving a new password or filling an existing
 * one, and the two cases need different tokens ('new-password' vs
 * 'current-password'). Making the caller name one means it can't be
 * forgotten.
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  label,
  describedBy,
  invalid = false,
  autoFocus = false,
  minLength,
  required = true,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  label: string
  describedBy?: string
  invalid?: boolean
  autoFocus?: boolean
  minLength?: number
  required?: boolean
}) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={revealed ? 'text' : 'password'}
          className="input pr-16"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          minLength={minLength}
          required={required}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          // Password managers and the browser's own autofill both need a
          // stable field; revealing swaps `type`, which is fine, but the
          // spellchecker must stay off either way.
          spellCheck={false}
          autoCapitalize="off"
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          // Not in the tab order: a keyboard user tabbing from the password
          // field wants the submit button, not this.
          tabIndex={-1}
          aria-pressed={revealed}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-xs font-medium text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          {revealed ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  )
}
