// See the matching comment in ../build/route.tsx — Jest's classic JSX
// transform needs this even though Next's real build doesn't.
import React from 'react'
import { apiError } from '@/lib/apiError'
import { NextRequest } from 'next/server'
import { ImageResponse } from 'next/og'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { PROJECT_TYPE_CONFIG } from '@/lib/projectType'
import { resolveImageDataUri } from '@/lib/pdf'
import { computeOriginalityScore } from '@/lib/originality'
import { CARD_WIDTH, CARD_HEIGHT, CARD_FONTS, CARD_COLORS, CardFooter, publicCardUrl } from '@/lib/card'
import { hasPro, PRO_SELECT } from '@/lib/pro'

// RL-021: restoration "transformation card" — before/after, 1200x630
// PNG. Owner-only, Pro-gated, restoration mode only. Shares its rendering
// engine and branding with RL-020's build card (src/lib/card.tsx).
export const runtime = 'nodejs'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return await apiError('notFound', 404)
  if (vehicle.projectType !== 'RESTORATION') {
    return await apiError('transformationRestorationOnly', 400)
  }

  const owner = await prisma.user.findUnique({ where: { id: session.user.id }, select: { ...PRO_SELECT, username: true } })
  if (!owner || !hasPro(owner)) {
    return await apiError('proShareCards', 403, { code: 'UPGRADE_REQUIRED' })
  }

  const config = PROJECT_TYPE_CONFIG[vehicle.projectType]
  const completeStatus = config.completeStatus

  const [foundState, tasks] = await Promise.all([
    prisma.foundState.findUnique({
      where: { vehicleId: vehicle.id },
      include: { photos: { orderBy: { createdAt: 'asc' } } } }),
    prisma.task.findMany({
      where: { vehicleId: vehicle.id },
      select: { status: true, originalityCondition: true, photos: { select: { id: true, url: true, createdAt: true } } } }),
  ])

  const { searchParams } = new URL(req.url)
  const beforeId = searchParams.get('before')
  const afterId = searchParams.get('after')

  const beforeCandidates = foundState?.photos ?? []
  const beforePhoto = beforeId ? beforeCandidates.find((p) => p.id === beforeId) : beforeCandidates[0]

  const afterCandidates = tasks
    .flatMap((t) => t.photos)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const afterPhoto = afterId ? afterCandidates.find((p) => p.id === afterId) : afterCandidates[0]

  const [beforeDataUri, afterDataUri] = await Promise.all([
    beforePhoto ? resolveImageDataUri(beforePhoto.url) : Promise.resolve(null),
    afterPhoto ? resolveImageDataUri(afterPhoto.url) : Promise.resolve(null),
  ])

  const startDate = foundState?.acquisitionDate ?? vehicle.createdAt
  const completedCount = tasks.filter((t) => t.status === completeStatus).length
  const isComplete = tasks.length > 0 && tasks.every((t) => t.status === completeStatus)
  const originalityScore = computeOriginalityScore(tasks, completeStatus)
  const url = publicCardUrl(vehicle.isPublic, owner.username, vehicle.slug)

  const hasBefore = Boolean(beforeDataUri)

  return new ImageResponse(
    (
      <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT, display: 'flex', position: 'relative', backgroundColor: CARD_COLORS.bg }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: CARD_WIDTH, height: CARD_HEIGHT, display: 'flex' }}>
          {hasBefore ? (
            <>
              <PhotoHalf dataUri={beforeDataUri} label="BEFORE" />
              <PhotoHalf dataUri={afterDataUri} label="AFTER" />
            </>
          ) : (
            <PhotoHalf dataUri={afterDataUri} label={afterDataUri ? 'CURRENT' : undefined} full />
          )}
        </div>

        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            display: 'flex',
            backgroundImage: `linear-gradient(to bottom, ${CARD_COLORS.overlayTop} 0%, transparent 35%, transparent 60%, ${CARD_COLORS.overlayBottom} 100%)` }}
        />

        <div style={{ position: 'absolute', top: 40, left: 56, right: 56, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 20, color: CARD_COLORS.brand, textTransform: 'uppercase', letterSpacing: 2 }}>
            Restoration
          </div>
          <div style={{ display: 'flex', fontSize: 46, fontWeight: 700, color: CARD_COLORS.text, marginTop: 4 }}>
            {vehicle.year} {vehicle.make} {vehicle.model}
          </div>
        </div>

        {!hasBefore && (
          <div style={{ position: 'absolute', top: 150, left: 56, display: 'flex', fontSize: 22, color: CARD_COLORS.textMuted }}>
            Add a found state photo to show the full transformation
          </div>
        )}

        <div style={{ position: 'absolute', left: 56, bottom: 100, display: 'flex', gap: 48 }}>
          <Stat label="Started" value={startDate.toLocaleDateString('ro-RO')} />
          <Stat label="Status" value={isComplete ? 'Complete' : 'In progress'} />
          <Stat label="Tasks" value={String(tasks.length)} />
          {originalityScore !== null && <Stat label="Originality" value={`${originalityScore}%`} />}
          <Stat label="Completed" value={String(completedCount)} />
        </div>

        <CardFooter url={url} />
      </div>
    ),
    { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: CARD_FONTS }
  )
}

function PhotoHalf({ dataUri, label, full }: { dataUri: string | null; label?: string; full?: boolean }) {
  const width = full ? CARD_WIDTH : CARD_WIDTH / 2
  return (
    <div style={{ width, height: CARD_HEIGHT, display: 'flex', position: 'relative', backgroundColor: '#1a1a1a' }}>
      {dataUri && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={dataUri} alt="" width={width} height={CARD_HEIGHT} style={{ objectFit: 'cover' }} />
      )}
      {label && (
        <div
          style={{
            position: 'absolute',
            top: 24,
            ...(full ? { right: 24 } : { left: 24 }),
            display: 'flex',
            fontSize: 18,
            fontWeight: 700,
            color: CARD_COLORS.text,
            backgroundColor: 'rgba(0,0,0,0.55)',
            padding: '6px 14px',
            borderRadius: 6 }}
        >
          {label}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', fontSize: 18, color: CARD_COLORS.textMuted }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 26, fontWeight: 700, color: CARD_COLORS.text }}>{value}</div>
    </div>
  )
}
