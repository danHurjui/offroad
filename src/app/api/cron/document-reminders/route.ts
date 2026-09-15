import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decideReminder, formatDaysUntil, getDocumentStatus, DOCUMENT_TYPE_OPTIONS } from '@/lib/documents'
import { labelFor } from '@/lib/projectType'
import { sendEmail, documentReminderEmailHtml } from '@/lib/email'

/**
 * RL-013: document reminders at 30/14/3 days before expiry, delivered by
 * email. Not user-facing — call this on a schedule (Vercel Cron, a
 * system crontab, GitHub Actions, etc.) with `x-cron-secret: $CRON_SECRET`.
 * There is no scheduler wired up in this repo; add one when deploying.
 *
 * In-app badge / web push are not implemented here — see CLAUDE.md.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const documents = await prisma.document.findMany({
    where: {
      OR: [{ reminder30SentAt: null }, { reminder14SentAt: null }, { reminder3SentAt: null }],
    },
    include: {
      vehicle: { select: { id: true, make: true, model: true, year: true, owner: { select: { email: true } } } },
    },
  })

  const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  let sent = 0

  for (const doc of documents) {
    const { daysUntil } = getDocumentStatus(doc.expiryDate)
    const decision = decideReminder(daysUntil, doc)
    if (!decision.shouldSend) continue

    const data: Record<string, Date> = {}
    for (const field of decision.fieldsToMarkSent) data[field] = new Date()
    await prisma.document.update({ where: { id: doc.id }, data })

    await sendEmail({
      to: doc.vehicle.owner.email,
      subject: `${labelFor(DOCUMENT_TYPE_OPTIONS, doc.type)} ${formatDaysUntil(daysUntil)}`,
      html: documentReminderEmailHtml({
        documentLabel: labelFor(DOCUMENT_TYPE_OPTIONS, doc.type),
        vehicleName: `${doc.vehicle.year} ${doc.vehicle.make} ${doc.vehicle.model}`,
        daysUntilLabel: formatDaysUntil(daysUntil),
        vehicleUrl: `${baseUrl}/dashboard/vehicles/${doc.vehicle.id}/documents`,
      }),
    })
    sent++
  }

  return NextResponse.json({ checked: documents.length, sent })
}
