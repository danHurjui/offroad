import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { readJsonBody } from '@/lib/requestBody'
import { consumeRateLimit, rateLimitResponse, clientIp } from '@/lib/rateLimit'
import { consumeVerificationToken } from '@/lib/emailVerification'

/**
 * Spends a confirmation link.
 *
 * **No session required, on purpose.** The link is routinely opened in
 * whatever browser the mail app hands it to — an in-app webview on a
 * phone, a different profile on a laptop — which is not the browser that
 * signed up. Demanding a session first would turn "click the link" into
 * "click the link, then log in in a browser you have never logged into,
 * then click it again". The token is the proof; it does not need a second
 * one.
 *
 * The rate limit is what a token that is 32 random bytes does not need
 * but gets anyway.
 */
export async function POST(req: NextRequest) {
  const limit = await consumeRateLimit('verifyEmailConsume', `ip:${clientIp(req.headers)}`)
  if (!limit.ok) return await rateLimitResponse(limit)

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error

  const token = typeof parsed.body.token === 'string' ? parsed.body.token.trim() : ''
  if (!token) return await apiError('tokenRequired', 400)

  try {
    const result = await consumeVerificationToken(token)
    if (!result.ok) {
      // The two failures need different things from the reader — wait for
      // nothing versus go and ask for a new link — so they stay distinct
      // rather than collapsing into one "invalid" message.
      return NextResponse.json({ error: result.reason, code: result.reason }, { status: 400 })
    }
    return NextResponse.json({ verified: true, alreadyVerified: result.alreadyVerified })
  } catch (e) {
    console.error('[verify-email] unexpected failure:', e)
    return await apiError('internalError', 500)
  }
}
