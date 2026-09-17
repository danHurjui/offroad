import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/authz'

const PAGE_SIZE = 25

/**
 * Admin user listing. Read-only, deliberately: the mutating counterpart
 * (`[userId]/route.ts`) only exposes activation, because `isPro` belongs
 * to the Stripe webhook and `isAdmin` is database-only — see CLAUDE.md.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.error

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const status = searchParams.get('status') // 'active' | 'inactive' | null

  try {
    const where = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { displayName: { contains: q, mode: 'insensitive' as const } },
              { username: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(status === 'active' ? { active: true } : status === 'inactive' ? { active: false } : {}),
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          email: true,
          displayName: true,
          username: true,
          isPro: true,
          isAdmin: true,
          active: true,
          createdAt: true,
          _count: { select: { vehicles: true, tickets: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return NextResponse.json({ users, total, page, pageSize: PAGE_SIZE })
  } catch {
    return await apiError('internalError', 500)
  }
}
