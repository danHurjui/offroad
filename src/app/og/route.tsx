// Jest's classic JSX transform needs React in scope (see card/build/route.tsx).
import React from 'react'
import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { getTranslations } from 'next-intl/server'
import { CARD_COLORS, CARD_FONTS, CARD_HEIGHT, CARD_WIDTH } from '@/lib/card'
import { DEMO_CHAPTERS, chapterValues, metaDescriptionFrom } from '@/lib/demoTour'

export const runtime = 'nodejs'

/**
 * The link-preview picture for the public pages: 1200×630, the size every
 * chat app and social site crops to. Without one a shared link rendered
 * as a line of text, and a preview with a picture is the one people click.
 *
 * `?feature=` names a tour chapter, and **only** a chapter: the text is
 * always this site's own catalogue, never taken from the query, so the
 * address cannot be used to draw somebody else's words on this domain.
 * Anything else, or nothing, gets the homepage's picture.
 *
 * Built on the share cards' Roboto (src/lib/card.tsx), which has the
 * Romanian diacritics the image library's own font lacks.
 */
export async function GET(req: NextRequest) {
  const feature = req.nextUrl.searchParams.get('feature')
  const chapter = DEMO_CHAPTERS.find((c) => c.id === feature)
  const t = await getTranslations(chapter ? 'demo' : 'home')
  const title = chapter ? t(`chapter.${chapter.id}.title`) : t('ogTitle')
  const body = metaDescriptionFrom(chapter ? t(`chapter.${chapter.id}.body`, chapterValues(chapter.id)) : t('metaDescription'), 150)

  return new ImageResponse(
    (
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          backgroundColor: CARD_COLORS.bg,
          backgroundImage: `linear-gradient(135deg, ${CARD_COLORS.bg} 55%, ${CARD_COLORS.brand} 160%)`,
          fontFamily: 'Roboto',
        }}
      >
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 700, color: CARD_COLORS.brand }}>RigLog</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700, color: CARD_COLORS.text, lineHeight: 1.1 }}>{title}</div>
          <div style={{ display: 'flex', fontSize: 30, color: CARD_COLORS.textMuted, lineHeight: 1.35 }}>{body}</div>
        </div>
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      fonts: CARD_FONTS,
      headers: { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
    }
  )
}
