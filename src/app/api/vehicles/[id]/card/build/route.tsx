// Jest's ts-jest transform is configured for the classic JSX runtime
// (jest.config.js), which needs React in scope even though Next's own
// build uses the automatic runtime and doesn't — react/jsx-uses-react
// keeps this from being flagged as an unused import.
import React from 'react'
import { apiError } from '@/lib/apiError'
import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { toNumberOrNull } from '@/lib/serialize'
import { resolveImageDataUri } from '@/lib/pdf'
import { CARD_WIDTH, CARD_HEIGHT, CARD_FONTS, CARD_COLORS, CardFooter, publicCardUrl } from '@/lib/card'
import { hasPro, PRO_SELECT } from '@/lib/pro'

// RL-020: off-road "build card" — 1200x630 PNG for sharing. Owner-only,
// Pro-gated. next/og's ImageResponse (Satori under the hood) renders fast
// enough that no explicit timing code is needed to hit the ticket's <5s
// budget; this route just needs to avoid doing anything slow itself
// (one cover-photo read, one tasks query).
export const runtime = 'nodejs'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT, username: true } })
  if (!owner || !hasPro(owner)) {
    return await apiError('proShareCards', 403, { code: 'UPGRADE_REQUIRED' })
  }

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const completeStatus = config.completeStatus

  const tasks = await prisma.task.findMany({
    where: { vehicleId: vehicle.id },
    select: { name: true, status: true, category: true, date: true, workType: true, costRon: true, partsCostRon: true, labourCostRon: true } })

  const completed = tasks.filter((t) => t.status === completeStatus)
  const topMods = [...completed].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 4)
  const categoriesWithCompletion = new Set(completed.map((t) => t.category))
  const progressPct = Math.round((categoriesWithCompletion.size / config.categories.length) * 100)
  const totalSpent = tasks.reduce((sum, t) => {
    const cost =
      t.workType === 'WORKSHOP'
        ? (toNumberOrNull(t.partsCostRon) ?? 0) + (toNumberOrNull(t.labourCostRon) ?? 0)
        : toNumberOrNull(t.costRon) ?? 0
    return sum + cost
  }, 0)

  const coverPhotoDataUri = vehicle.coverPhotoUrl ? await resolveImageDataUri(vehicle.coverPhotoUrl) : null
  const url = publicCardUrl(vehicle.isPublic, owner.username, vehicle.slug)

  return new ImageResponse(
    (
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          display: 'flex',
          position: 'relative',
          backgroundColor: CARD_COLORS.bg }}
      >
        {coverPhotoDataUri && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverPhotoDataUri}
            alt=""
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
            style={{ position: 'absolute', top: 0, left: 0, objectFit: 'cover' }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            display: 'flex',
            backgroundImage: `linear-gradient(to bottom, ${CARD_COLORS.overlayTop}, ${CARD_COLORS.overlayBottom})` }}
        />

        <div style={{ position: 'absolute', top: 56, left: 56, right: 56, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 400, color: CARD_COLORS.brand, textTransform: 'uppercase', letterSpacing: 2 }}>
            {config.label}
          </div>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: CARD_COLORS.text, marginTop: 8 }}>
            {vehicle.year} {vehicle.make} {vehicle.model}
          </div>
        </div>

        {topMods.length > 0 && (
          <div style={{ position: 'absolute', left: 56, bottom: 190, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topMods.map((t, i) => (
              <div key={i} style={{ display: 'flex', fontSize: 26, color: CARD_COLORS.text }}>
                • {t.name}
              </div>
            ))}
          </div>
        )}

        <div style={{ position: 'absolute', left: 56, bottom: 100, display: 'flex', gap: 48 }}>
          <Stat label="Modifications" value={String(tasks.length)} />
          <Stat label="Progress" value={`${progressPct}%`} />
          <Stat label="Spent" value={`${totalSpent.toLocaleString('ro-RO')} RON`} />
        </div>

        <CardFooter url={url} />
      </div>
    ),
    { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: CARD_FONTS }
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', fontSize: 20, color: CARD_COLORS.textMuted }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: CARD_COLORS.text }}>{value}</div>
    </div>
  )
}
