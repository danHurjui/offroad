/**
 * Creates (or promotes) an admin account, straight against the database.
 *
 * `User.isAdmin` moderates the public feedback board, and it is deliberately
 * not settable through any route — not even by another admin. `PATCH
 * /api/admin/users/[userId]` accepts exactly `active` and `isProComped`, so
 * there is no in-app path by which a compromised session could mint a new
 * moderator. The consequence is that the *first* admin has to be made from
 * outside the app, and that is what this script is: the documented way to do
 * it, instead of a hand-typed UPDATE that has to get the bcrypt cost, the
 * email casing and the username generation right from memory.
 *
 * Run it against whatever `DATABASE_URL` points at — locally that is the
 * docker-compose Postgres, in production the Neon connection string from the
 * Vercel project. It prints the host it is about to write to before touching
 * anything, because the whole risk here is running it against the wrong one.
 *
 *   npm run db:create-admin -- you@example.com "Your Name"
 *
 * Flags and environment:
 *   --reset-password   also set a new password on an account that exists
 *   --yes              skip the confirmation prompt (for CI / non-interactive)
 *   ADMIN_EMAIL        email, if not given as the first argument
 *   ADMIN_NAME         display name, if not given as the second argument
 *   ADMIN_PASSWORD     password; one is generated and printed when unset
 *
 * Safe to re-run: promoting an account that is already an admin changes
 * nothing, and an existing account never has its password touched unless
 * --reset-password says so.
 */
// The imports below are relative rather than `@/`-aliased: this runs under
// ts-node, outside Next's bundler, so the alias would not resolve. tsconfig's
// `ts-node.compilerOptions` overrides `module` to commonjs for the same
// reason — the app's `esnext`/`bundler` pair emits ESM, which then demands
// file extensions on every relative import.
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'
import { createInterface } from 'readline'
import { hashPassword, isPasswordStrongEnough } from '../src/lib/password'
import { slugify, uniqueSlug } from '../src/lib/slug'

const prisma = new PrismaClient()

interface Args {
  email: string
  displayName: string
  resetPassword: boolean
  yes: boolean
}

function parseArgs(argv: string[]): Args {
  const flags = new Set(argv.filter((a) => a.startsWith('--')))
  const positional = argv.filter((a) => !a.startsWith('--'))

  // Lowercased for the same reason the Google sign-in callback lowercases
  // before matching: `User.email` is unique but case-sensitive, so a
  // mixed-case address here would create a second account alongside the
  // one the person already signs in with.
  const email = (positional[0] ?? process.env.ADMIN_EMAIL ?? '').toLowerCase().trim()
  const displayName = (positional[1] ?? process.env.ADMIN_NAME ?? '').trim()

  return {
    email,
    displayName: displayName || email.split('@')[0] || '',
    resetPassword: flags.has('--reset-password'),
    yes: flags.has('--yes'),
  }
}

/**
 * The database this is about to write to, with the credentials stripped.
 *
 * Printed rather than assumed: the only serious mistake available here is
 * pointing a production connection string at a test run, or the reverse,
 * and neither is visible from the command line you typed.
 */
function describeTarget(): string {
  const url = process.env.DATABASE_URL
  if (!url) return '(DATABASE_URL is not set)'
  try {
    const parsed = new URL(url)
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}`
  } catch {
    return '(DATABASE_URL is not a URL)'
  }
}

/** A password nobody has to invent, when the operator supplied none. */
function generatePassword(): string {
  return randomBytes(18).toString('base64url')
}

async function confirm(question: string): Promise<boolean> {
  // No TTY means a script or CI is driving this; there is nobody to answer,
  // so --yes is the only way through rather than hanging on a read.
  if (!process.stdin.isTTY) return false

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve))
    return answer.trim().toLowerCase() === 'y'
  } finally {
    rl.close()
  }
}

/**
 * A unique public handle, the same shape the register route generates.
 *
 * Kept local rather than importing src/lib/username.ts, which reaches for
 * the app's shared Prisma client through the `@/` alias this standalone
 * script cannot resolve. The rules that matter — how a name becomes a slug
 * and how collisions are suffixed — still come from src/lib/slug.ts.
 */
async function generateUsername(seed: string): Promise<string> {
  return uniqueSlug(slugify(seed) || 'user', async (candidate) => {
    const existing = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } })
    return Boolean(existing)
  })
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.email || !args.email.includes('@')) {
    console.error('Usage: npm run db:create-admin -- <email> [displayName] [--reset-password] [--yes]')
    process.exit(1)
  }

  const existing = await prisma.user.findUnique({
    where: { email: args.email },
    select: { id: true, email: true, displayName: true, isAdmin: true, active: true },
  })

  const action = existing ? 'Promote existing account to admin' : 'Create a new admin account'
  console.log(`Database: ${describeTarget()}`)
  console.log(`Action:   ${action}`)
  console.log(`Email:    ${args.email}`)
  if (!existing) console.log(`Name:     ${args.displayName}`)
  if (existing?.isAdmin && !args.resetPassword) {
    console.log('\nThis account is already an admin. Nothing to do.')
    return
  }

  if (!args.yes && !(await confirm('\nProceed? [y/N] '))) {
    console.error('\nAborted. Re-run with --yes to skip this prompt.')
    process.exit(1)
  }

  // Generated only when the operator supplied none, and only for a write
  // that actually sets a password — so promoting an existing account never
  // prints a credential that was not used.
  const needsPassword = !existing || args.resetPassword
  const supplied = process.env.ADMIN_PASSWORD ?? ''
  const generated = needsPassword && !supplied ? generatePassword() : ''
  const plain = supplied || generated

  if (needsPassword && !isPasswordStrongEnough(plain)) {
    console.error('\nADMIN_PASSWORD is shorter than the 8 characters the login route requires.')
    process.exit(1)
  }

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        isAdmin: true,
        // A deactivated account is rejected by requireSession() within the
        // session-revalidation window, so an inactive admin is an admin who
        // cannot log in. Granting the flag has to mean granting access.
        active: true,
        ...(args.resetPassword ? { password: await hashPassword(plain) } : {}),
      },
    })

    console.log(`\nDone. ${existing.email} is now an admin${existing.active ? '' : ' (and was reactivated)'}.`)
    if (args.resetPassword) console.log('Its password was reset.')
  } else {
    await prisma.user.create({
      data: {
        email: args.email,
        password: await hashPassword(plain),
        displayName: args.displayName,
        username: await generateUsername(args.displayName),
        accountType: 'OWNER',
        active: true,
        isAdmin: true,
        // Deliberately not created through createUserWithFoundingGrant():
        // an operator account must not consume one of the hundred public
        // founding-member slots. Nothing else in that helper applies here.
      },
    })

    console.log(`\nDone. Created ${args.email} as an admin.`)
  }

  if (generated) {
    console.log(`\n  Password: ${generated}`)
    console.log('\nThis is the only time it is shown. Change it after signing in.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
