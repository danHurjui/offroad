// See the matching comment in card/build/route.tsx — Jest's classic JSX
// transform needs this even though Next's real build doesn't.
import React from 'react'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * Shared 1200×630 share-card rendering pieces for RL-020 (off-road build
 * card) and RL-021 (restoration transformation card) — both are
 * `next/og` ImageResponse routes; this is the "factor out common
 * card-rendering pieces rather than duplicating" the RL-021 ticket asks
 * for.
 */
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

function loadFont(file: string): ArrayBuffer {
  const buf = readFileSync(path.join(process.cwd(), 'fonts', 'Roboto', file))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

// Same bundled Roboto used for PDF export (src/lib/pdf.ts) — covers
// Romanian diacritics in an owner's display name, which the OG image
// library's default font doesn't.
export const CARD_FONTS = [
  { name: 'Roboto', data: loadFont('Roboto-Regular.ttf'), weight: 400 as const, style: 'normal' as const },
  { name: 'Roboto', data: loadFont('Roboto-Medium.ttf'), weight: 700 as const, style: 'normal' as const },
]

export const CARD_COLORS = {
  bg: '#0B0B0F',
  overlayTop: 'rgba(11,11,15,0.15)',
  overlayBottom: 'rgba(11,11,15,0.92)',
  brand: '#4D87B3',
  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.72)',
}

/** Bottom-left "RigLog" wordmark + bottom-right URL, shared by both cards. */
export function CardFooter({ url }: { url: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 40,
        left: 56,
        right: 56,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: CARD_COLORS.brand }}>RigLog</div>
      <div style={{ display: 'flex', fontSize: 24, color: CARD_COLORS.textMuted }}>{url}</div>
    </div>
  )
}

export function publicCardUrl(isPublic: boolean, username: string | null, slug: string | null): string {
  if (isPublic && username && slug) return `riglog.ro/builds/${username}/${slug}`
  return 'riglog.ro'
}
