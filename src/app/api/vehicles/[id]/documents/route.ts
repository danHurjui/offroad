import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSession } from '@/lib/authz'
import { requireVehicleOwner } from '@/lib/access'
import { isValidDocumentType } from '@/lib/documents'
import { readJsonBody } from '@/lib/requestBody'

// RL-013: document reminders — ITP, RCA, CASCO, Rovinieta, and travel docs.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const documents = await prisma.document.findMany({
    where: { vehicleId: vehicle.id },
    orderBy: { expiryDate: 'asc' },
  })

  return NextResponse.json(documents)
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireSession()
  if (!auth.ok) return auth.error
  const { session } = auth

  const vehicle = await requireVehicleOwner(params.id, session.user.id)
  if (!vehicle) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = await readJsonBody(req)
  if (!parsed.ok) return parsed.error
  const body = parsed.body

  try {
    const { type, expiryDate } = body

    if (!isValidDocumentType(type)) {
      return NextResponse.json({ error: 'Invalid document type' }, { status: 400 })
    }
    if (!expiryDate || Number.isNaN(new Date(expiryDate).getTime())) {
      return NextResponse.json({ error: 'expiryDate is required' }, { status: 400 })
    }

    const document = await prisma.document.create({
      data: { vehicleId: vehicle.id, type, expiryDate: new Date(expiryDate) },
    })

    return NextResponse.json(document, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
