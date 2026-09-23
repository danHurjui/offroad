import { NextRequest, NextResponse } from 'next/server'
import { apiError, apiErrorWith } from '@/lib/apiError'
import { requireSession } from '@/lib/authz'
import { prisma } from '@/lib/prisma'
import { readJsonBody } from '@/lib/requestBody'
import { parseAccident } from '@/lib/accidents'
import { toNumberOrNull } from '@/lib/serialize'
import { deleteStoredFiles } from '@/lib/personalData'
import { loadAccident } from '../load'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; accidentId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await loadAccident(params.id, params.accidentId, auth.session.user.id)
  if (!loaded.ok) return loaded.error

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const accident = parseAccident(parsed.body, { create: false, existing: loaded.accident })
  if (!accident.ok) return await apiErrorWith('accidentFieldInvalid', { field: accident.field }, 400)

  try {
    const updated = await prisma.accident.update({ where: { id: loaded.accident.id }, data: accident.data })
    return NextResponse.json({ ...updated, repairCostRon: toNumberOrNull(updated.repairCostRon) })
  } catch {
    return await apiError('internalError', 500)
  }
}

/**
 * Removing a record takes its photos with it. The files go after the rows,
 * best effort: a storage hiccup must not leave the record undeletable.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; accidentId: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const loaded = await loadAccident(params.id, params.accidentId, auth.session.user.id)
  if (!loaded.ok) return loaded.error
  try {
    await prisma.accident.delete({ where: { id: loaded.accident.id } })
  } catch {
    return await apiError('internalError', 500)
  }
  await deleteStoredFiles(loaded.accident.photos.map((p) => p.url))
  return NextResponse.json({ ok: true })
}
