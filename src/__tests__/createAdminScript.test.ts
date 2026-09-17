import fs from 'fs'
import path from 'path'

/**
 * `User.isAdmin` is settable from nowhere in the app — not by another
 * admin, since `PATCH /api/admin/users/[userId]` copies only `active` and
 * `isProComped`. That is deliberate, and it makes `scripts/create-admin.ts`
 * the one supported way to make the first moderator. Nothing else imports
 * it, so nothing else would notice it rotting; these are the properties an
 * operator is trusting when they run it against production.
 */
describe('scripts/create-admin.ts', () => {
  const SOURCE = fs.readFileSync(path.join(process.cwd(), 'scripts', 'create-admin.ts'), 'utf8')
  // The script explains at length what it deliberately does *not* do, so a
  // negative assertion has to read the code rather than the prose.
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('is exposed as an npm script', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
    expect(pkg.scripts['db:create-admin']).toContain('scripts/create-admin.ts')
  })

  it('hashes through the app’s own helper rather than a second bcrypt cost', () => {
    expect(SOURCE).toMatch(/from '\.\.\/src\/lib\/password'/)
    expect(SOURCE).toMatch(/hashPassword\(/)
    // A hand-rolled bcrypt call here could drift from SALT_ROUNDS and
    // produce a hash the login route quietly rejects.
    expect(CODE).not.toMatch(/bcrypt\.hash/)
  })

  it('refuses a password the login route would reject', () => {
    expect(SOURCE).toMatch(/isPasswordStrongEnough\(/)
  })

  it('lowercases the email before matching', () => {
    // User.email is unique but case-sensitive: a mixed-case address would
    // create a second account beside the one that already exists, the same
    // trap the Google signIn callback avoids.
    expect(SOURCE).toMatch(/\.toLowerCase\(\)/)
  })

  it('grants admin and leaves the account able to log in', () => {
    expect(SOURCE).toMatch(/isAdmin: true/)
    // requireSession() rejects an inactive session, so an inactive admin is
    // an admin who cannot sign in.
    expect(SOURCE).toMatch(/active: true/)
  })

  it('does not consume a founding-member slot', () => {
    // The promotion is for the first hundred *signups*; an operator account
    // created by hand must not take one of them.
    expect(CODE).not.toMatch(/createUserWithFoundingGrant|claimFoundingNumber|foundingMemberGrant/)
  })

  it('names the database it is about to write to', () => {
    // The only serious mistake available is running it against the wrong
    // one, and the command line does not show which that is.
    expect(SOURCE).toMatch(/console\.log\(`Database: /)
  })

  it('never prints the connection string it parsed', () => {
    // describeTarget() returns host/port/database only — a DATABASE_URL
    // echoed into a terminal is a credential in the scrollback.
    expect(CODE).not.toMatch(/console\.log\([^)]*process\.env\.DATABASE_URL/)
  })
})
