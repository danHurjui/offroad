import { assessPassword, MIN_PASSWORD_LENGTH } from '@/lib/passwordStrength'
import { isPasswordStrongEnough } from '@/lib/password'

describe('assessPassword', () => {
  it('calls anything under the minimum too short', () => {
    for (const p of ['', 'a', 'short', 'seven77']) {
      expect(assessPassword(p).strength).toBe('too-short')
      expect(assessPassword(p).score).toBe(0)
    }
  })

  it('names the most common passwords as weak however long they are', () => {
    expect(assessPassword('password123').strength).toBe('weak')
    expect(assessPassword('PASSWORD123').strength).toBe('weak')
    expect(assessPassword('parola123').strength).toBe('weak')
  })

  it('treats a long run of one character or a pure number as weak', () => {
    expect(assessPassword('aaaaaaaaaaaa').strength).toBe('weak')
    expect(assessPassword('1029384756').strength).toBe('weak')
  })

  it('rates a long passphrase strong without demanding symbols', () => {
    expect(assessPassword('cutie de viteze manuala').strength).toBe('strong')
    expect(assessPassword('correcthorsebatterystaple').strength).toBe('strong')
  })

  it('rates a short-but-mixed password only fair or weak', () => {
    expect(['weak', 'fair']).toContain(assessPassword('Ab3$efgh').strength)
  })

  it('gives a concrete hint for anything short of strong', () => {
    for (const p of ['abcdefgh', 'password123', '1029384756', 'short']) {
      expect(assessPassword(p).hint).toBeTruthy()
    }
    expect(assessPassword('cutie de viteze manuala').hint).toBeNull()
  })

  it('always produces a score the meter can render', () => {
    for (const p of ['', 'abc', 'abcdefgh', 'password123', 'a long and fine passphrase']) {
      expect([0, 1, 2, 3]).toContain(assessPassword(p).score)
    }
  })
})

/**
 * The meter is advisory. If it were ever stricter than the server, a user
 * would be told their password is unusable while the API would have taken
 * it — the kind of mismatch nobody can debug from the outside.
 */
describe('the meter is never stricter than the server', () => {
  it('agrees with the server on the minimum length', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
  })

  it('flags "too short" for exactly the passwords the server rejects', () => {
    const samples = ['', 'a', 'abcdefg', 'abcdefgh', 'abcdefghi', 'a much longer one']
    for (const p of samples) {
      const serverAccepts = isPasswordStrongEnough(p)
      const meterSaysTooShort = assessPassword(p).strength === 'too-short'
      expect(meterSaysTooShort).toBe(!serverAccepts)
    }
  })
})
