import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { consumeRateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import {
  isEmailVerified,
  isVerificationEnforced,
  sendVerificationEmail,
} from '@/lib/emailVerification'

/**
 * Sends the confirmation link again, to the address on the session's own
 * account.
 *
 * The address is read from the database rather than taken from the body.
 * A resend that accepted a destination would be an open mail relay with
 * this app's name on the envelope — anyone with any account could have it
 * write to any address they liked.
 */
export async function POST(req: NextRequest) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const userId = auth.session.user.id

  // Per account first: it is the dimension that cannot be rotated, and it
  // is the one that bounds how much mail a single inbox can be sent.
  const byUser = await consumeRateLimit('verifyEmailSend', `user:${userId}`)
  if (!byUser.ok) return await rateLimitResponse(byUser)
  const byIp = await consumeRateLimit('verifyEmailSendIp', `ip:${clientIp(req.headers)}`)
  if (!byIp.ok) return await rateLimitResponse(byIp)

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, locale: true, emailVerifiedAt: true },
    })
    if (!user) return await apiError('notFound', 404)

    // Nothing to prove, and no second link to leave lying in an inbox.
    if (isEmailVerified(user)) {
      return NextResponse.json({ sent: false, alreadyVerified: true })
    }

    const delivery = await sendVerificationEmail(user)
    if (!delivery.sent) {
      // 503, not 500: nothing is broken about the request, the deployment
      // cannot send mail. The body names which of the two it was so the
      // button can say something truer than "try again".
      return NextResponse.json(
        { sent: false, code: delivery.reason, enforced: isVerificationEnforced() },
        { status: 503 }
      )
    }

    return NextResponse.json({ sent: true })
  } catch (e) {
    console.error('[verify-email/send] unexpected failure:', e)
    return await apiError('internalError', 500)
  }
}
