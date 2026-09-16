/**
 * A hint shown while typing a new password. Deliberately advisory: the only
 * rule the server actually enforces is `isPasswordStrongEnough()` (8+
 * characters, src/lib/password.ts), and nothing here is allowed to be
 * stricter than that — a meter that refuses a password the API would have
 * accepted is just a bug the user can't argue with.
 *
 * Lives apart from password.ts because that module imports bcryptjs, which
 * has no business being pulled into a client bundle.
 *
 * Length dominates on purpose. A long passphrase beats a short password
 * with a symbol bolted on, and scoring character classes heavily is what
 * pushes people towards "Pa$$w0rd".
 */

export const MIN_PASSWORD_LENGTH = 8

export type PasswordStrength = 'too-short' | 'weak' | 'fair' | 'strong'

export interface PasswordAssessment {
  strength: PasswordStrength
  label: string
  /** 0–3, for the meter width. */
  score: number
  /** One concrete thing that would help, or null when it's already strong. */
  hint: string | null
}

/** Passwords common enough that length alone means nothing. */
const COMMON = new Set([
  'password', 'password1', 'passw0rd', '12345678', '123456789', '1234567890',
  'qwertyui', 'qwerty123', 'iloveyou', 'admin123', 'welcome1', 'letmein1',
  'parola123', 'parolamea', 'football', 'baseball', 'sunshine', 'princess',
  'dragon123', 'monkey123', 'abc12345', 'password123',
])

export function assessPassword(password: string): PasswordAssessment {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      strength: 'too-short',
      label: 'Too short',
      score: 0,
      hint: `At least ${MIN_PASSWORD_LENGTH} characters.`,
    }
  }

  if (COMMON.has(password.toLowerCase())) {
    return {
      strength: 'weak',
      label: 'Weak',
      score: 1,
      hint: 'That is one of the most guessed passwords. Pick something else.',
    }
  }

  // A run of the same character, or a pure digit string, is long but trivial.
  if (/^(.)\1+$/.test(password) || /^\d+$/.test(password)) {
    return {
      strength: 'weak',
      label: 'Weak',
      score: 1,
      hint: 'Mix in letters and something that is not a repeated pattern.',
    }
  }

  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter((re) => re.test(password)).length

  if (password.length >= 16 || (password.length >= 12 && classes >= 2)) {
    return { strength: 'strong', label: 'Strong', score: 3, hint: null }
  }

  if (password.length >= 12 || classes >= 3) {
    return {
      strength: 'fair',
      label: 'Fair',
      score: 2,
      hint: 'A few more characters would make this much harder to guess.',
    }
  }

  return {
    strength: 'weak',
    label: 'Weak',
    score: 1,
    hint: 'Longer is better — three unrelated words beat a short password.',
  }
}
