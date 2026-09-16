'use client'

import { assessPassword } from '@/lib/passwordStrength'

const BAR_CLASS: Record<number, string> = {
  0: 'w-0',
  1: 'w-1/3 bg-red-500',
  2: 'w-2/3 bg-amber-500',
  3: 'w-full bg-green-500',
}

/**
 * Advisory only — the submit button never depends on this. The server's rule
 * is 8 characters and nothing here is stricter, so a "Weak" password still
 * submits. Showing it while typing (rather than after a failed submit) is
 * the whole point.
 */
export default function PasswordStrengthMeter({ password, id }: { password: string; id?: string }) {
  if (!password) return null
  const { label, score, hint } = assessPassword(password)

  return (
    <div id={id} className="mt-2">
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-subtle">
        <div className={`h-full rounded-full transition-all ${BAR_CLASS[score]}`} />
      </div>
      {/* Polite, not assertive: this updates on every keystroke and would
          otherwise talk over the user as they type. */}
      <p className="mt-1 text-xs text-ink-faint" aria-live="polite">
        <span className="font-medium text-ink-muted">{label}.</span>
        {hint ? ` ${hint}` : ''}
      </p>
    </div>
  )
}
