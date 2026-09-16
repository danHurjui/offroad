import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { prisma } from './prisma'
import { verifyPassword } from './password'
import { generateUsername } from './username'
import { consumeRateLimit, clientIp } from './rateLimit'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email.toLowerCase().trim()

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
        const ip = clientIp(new Headers((req?.headers ?? {}) as Record<string, string>))
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
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        if (!user.email) return false
        try {
          let dbUser = await prisma.user.findUnique({ where: { email: user.email } })
          if (!dbUser) {
            const displayName = user.name ?? user.email.split('@')[0]
            dbUser = await prisma.user.create({
              data: {
                email: user.email,
                displayName,
                username: await generateUsername(displayName),
                accountType: 'OWNER',
                active: true,
              },
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

    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === 'credentials') {
          token.id = user.id
        } else if (account?.provider === 'google') {
          const dbUser = await prisma.user.findUnique({ where: { email: user.email! } })
          if (dbUser) token.id = dbUser.id
        }
      }
      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
  },
  pages: { signIn: '/login', error: '/login' },
  session: { strategy: 'jwt' },
}
