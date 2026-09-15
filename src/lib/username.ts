import { prisma } from '@/lib/prisma'
import { slugify, uniqueSlug } from '@/lib/slug'

/**
 * RL-018: generates a globally-unique public handle from a seed (usually
 * displayName, or the email local-part for Google sign-in when no name is
 * given). Called at account creation (register route, auth.ts's Google
 * signIn callback) and, as a lazy backfill, the first time a
 * pre-RL-018 account without one publishes a vehicle.
 */
export async function generateUsername(seed: string): Promise<string> {
  const base = slugify(seed) || 'user'
  return uniqueSlug(base, async (candidate) => {
    const existing = await prisma.user.findUnique({ where: { username: candidate }, select: { id: true } })
    return Boolean(existing)
  })
}

/** Ensures `userId` has a username, generating and saving one if it doesn't yet. */
export async function ensureUsername(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true, displayName: true } })
  if (user.username) return user.username

  const username = await generateUsername(user.displayName)
  await prisma.user.update({ where: { id: userId }, data: { username } })
  return username
}
