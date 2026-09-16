import { NextResponse, type NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from '@/i18n/config'

/**
 * Records a language choice.
 *
 * Deliberately **not** behind `requireSession()`: the homepage, the
 * feedback board, the donate page and every public build profile are
 * readable with no account, and a visitor reading one of those has as
 * much right to read it in English as a subscriber does. So the cookie is
 * always set; `User.locale` is written only when there is an account to
 * write it to.
 *
 * Both are written because they answer different questions — see
 * src/i18n/config.ts. The cookie decides what the next page renders as;
 * the column decides what language the next reminder email arrives in.
 *
 * No rate limit rule: the write is a single column on the caller's own
 * row, it creates nothing, and it is bounded to two possible values. A
 * limit here would only ever fire on someone flipping the switch back and
 * forth.
 */
export async function POST(req: NextRequest) {
  let locale: unknown
  try {
    locale = (await req.json())?.locale
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Allow-listed against LOCALES rather than trusted: the value goes
  // straight into a Set-Cookie and into the database.
  if (!isLocale(locale)) {
    return NextResponse.json({ error: 'Unsupported language' }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  if (session?.user?.id && session.user.active !== false) {
    // Best effort. Missing the column write means emails stay in the old
    // language; failing the request would mean the switch appears broken,
    // which is the worse of the two.
    await prisma.user
      .update({ where: { id: session.user.id }, data: { locale } })
      .catch((e) => console.error('[locale] could not persist the choice to the account', e))
  }

  const res = NextResponse.json({ locale })
  res.cookies.set(LOCALE_COOKIE, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
    // Not httpOnly: it holds no identifier and nothing is authorised by
    // it. Readable from script so a future client-side render can pick
    // the same language without a round trip.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
