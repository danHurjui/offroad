import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from './prisma'
import { verifyPassword } from './password'
import { generateUsername } from './username'
import { createUserWithFoundingGrant } from './foundingMembers'
import { consumeRateLimit, clientIp } from './rateLimit'
import { verifyTurnstile } from './turnstile'

/** How long a session token stays valid without re-authenticating. */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/**
 * How stale the `active`/`isAdmin` flags on a token may get. A banned
 * user keeps working for at most this long — the tradeoff against a
 * database read on every authenticated request.
 */
export const REVALIDATE_AFTER_SECONDS = 60

/**
 * Whether Google sign-in is usable. Both halves have to be present — a
 * provider registered with an empty client id still renders a "Continue
 * with Google" button that leads to a Google error page, which looks like
 * the app is broken rather than like a setting is missing.
 */
export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export const authOptions: NextAuthOptions = {
  providers: [
    // Registered only when configured, so the button can be hidden rather
    // than shown and broken.
    ...(isGoogleAuthConfigured()
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        // Carried through the same POST as the password so the bot check
        // happens on the request that actually tries a credential, rather
        // than on a separate call a script could simply not make.
        turnstileToken: { label: 'Turnstile', type: 'text' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email.toLowerCase().trim()

        const ip = clientIp(new Headers((req?.headers ?? {}) as Record<string, string>))

        // First, because it is the cheapest thing that can refuse the
        // request and it costs no database round trip. A failure here is
        // indistinguishable from a wrong password, for the same reason
        // the rate limit below is — see the note there. LoginForm resets
        // its widget on every submit so a retry always carries a fresh
        // token: Cloudflare rejects a reused one, which would otherwise
        // turn a single mistyped password into a form that never works
        // again.
        const bot = await verifyTurnstile(credentials.turnstileToken, ip)
        if (!bot.ok) return null

        // Throttle credential stuffing. Keyed on both the target account
        // and the source IP: the email key stops one account being ground
        // down from many hosts, the IP key stops one host spraying many
        // accounts. Both are consumed so neither dimension is a free pass.
        //
        // NextAuth gives no way to return a distinct "rate limited" error
        // from authorize() — returning null is the only signal — so a
        // throttled attempt is indistinguishable from a wrong password.
        // That's acceptable here, and arguably better: it tells an
        // attacker nothing about whether they tripped a limit.
        const [byEmail, byIp] = await Promise.all([
          consumeRateLimit('login', `email:${email}`),
          consumeRateLimit('loginIp', `ip:${ip}`),
        ])
        if (!byEmail.ok || !byIp.ok) return null

        try {
          const user = await prisma.user.findUnique({ where: { email } })
          if (!user || !user.active || !user.password) return null
          const valid = await verifyPassword(credentials.password, user.password)
          if (!valid) return null
          return { id: user.id, name: user.displayName, email: user.email }
        } catch {
          return null
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        if (!user.email) return false

        // An unverified Google address must never be matched against an
        // existing account: this callback links by email, so accepting one
        // would let anyone who can assert an address take over the account
        // that already owns it. Google verifies consumer addresses, but a
        // Workspace domain can hand out aliases that are not, so the claim
        // is checked rather than assumed.
        if ((profile as { email_verified?: boolean } | undefined)?.email_verified === false) {
          console.error('[OAuth signIn] refused: Google reports this address as unverified')
          return false
        }

        const email = user.email.toLowerCase().trim()
        try {
          let dbUser = await prisma.user.findUnique({ where: { email } })
          if (!dbUser) {
            const displayName = user.name ?? email.split('@')[0]
            // Same path as a password signup, so a Google account can be a
            // founding member too — the promotion is "the first hundred
            // accounts", not "the first hundred passwords".
            dbUser = await createUserWithFoundingGrant({
              email,
              displayName,
              username: await generateUsername(displayName),
              accountType: 'OWNER',
              active: true,
              // Verified at creation, and this is the branch that earns
              // it: the check above has just refused any address Google
              // reports as unverified, so reaching here means the party
              // that owns the mailbox has already confirmed the claim.
              // Mailing a link to prove it again would ask the person to
              // do a worse version of what has already been done.
              emailVerifiedAt: new Date(),
            })
          }
          if (!dbUser.active) return false

          await prisma.oAuthAccount.upsert({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            update: { userId: dbUser.id },
            create: {
              userId: dbUser.id,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
            },
          })
          return true
        } catch (e) {
          console.error('[OAuth signIn error]', e)
          return false
        }
      }
      return true
    },

    /**
     * Sessions are JWTs, so nothing about the user is re-read from the
     * database once the token is minted. That means a deactivated or
     * demoted account would keep working until its token expired — up to
     * SESSION_MAX_AGE_SECONDS. Since deactivation is the moderation lever
     * behind the admin screens, the token is revalidated against the
     * database at most every REVALIDATE_AFTER_SECONDS: often enough that a
     * ban takes effect promptly, rarely enough that it isn't a database
     * round trip on every single request.
     *
     * `active` and `isAdmin` ride on the token so authz doesn't re-query
     * per call; the staleness window is bounded by the same interval.
     */
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === 'credentials') {
          token.id = user.id
        } else if (account?.provider === 'google') {
          // Normalised the same way signIn stored it, or a mixed-case
          // Google address would miss the row it just created.
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email!.toLowerCase().trim() },
          })
          if (dbUser) token.id = dbUser.id
        }
        token.checkedAt = 0 // force a check on the first request after sign-in
      }

      if (!token.id) return token

      const now = Math.floor(Date.now() / 1000)
      const checkedAt = typeof token.checkedAt === 'number' ? token.checkedAt : 0
      if (now - checkedAt < REVALIDATE_AFTER_SECONDS) return token

      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { active: true, isAdmin: true },
        })
        // A deleted user is treated as inactive rather than left as-is.
        token.active = dbUser?.active ?? false
        token.isAdmin = dbUser?.isAdmin ?? false
        token.checkedAt = now
      } catch {
        // Fail closed on flags but don't wipe the session: leave whatever
        // was last known, and retry on the next request (checkedAt is not
        // advanced, so this doesn't cache a failure for the full interval).
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        // Default to active so a token minted before this field existed
        // isn't locked out; the first revalidation sets it properly.
        session.user.active = token.active !== false
        session.user.isAdmin = token.isAdmin === true
      }
      return session
    },
  },
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
}
