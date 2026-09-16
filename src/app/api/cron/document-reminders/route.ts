import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decideReminder, formatDaysUntil, getDocumentStatus, DOCUMENT_TYPE_OPTIONS } from '@/lib/documents'
import { labelFor } from '@/lib/projectType'
import { sendEmail, documentReminderEmailHtml } from '@/lib/email'
import { purgeExpiredRateLimits } from '@/lib/rateLimit'

/**
 * RL-013: document reminders at 30/14/3 days before expiry, delivered by
 * email. Not user-facing.
 *
 * vercel.json wires a daily Vercel Cron job at this path when deployed
 * there — Vercel invokes cron routes with GET and, when CRON_SECRET is
 * set as a project env var, automatically adds `Authorization: Bearer
 * $CRON_SECRET` (see https://vercel.com/docs/cron-jobs/manage-cron-jobs
 * #securing-cron-jobs). Off Vercel, call it yourself (a crontab, GitHub
 * Actions, curl) with either that header or `x-cron-secret: $CRON_SECRET`
 * — POST is accepted too, for manual/non-GET callers.
 *
 * In-app badge / web push are not implemented here — see CLAUDE.md.
 */
async function handle(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const secret = bearer ?? req.headers.get('x-cron-secret')
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

  // Piggyback the rate-limit sweep on the daily cron rather than adding a
  // second scheduled function — elapsed windows are dead rows, and Vercel's
  // Hobby plan allows only a limited number of cron jobs.
  const purgedRateLimits = await purgeExpiredRateLimits()

  return NextResponse.json({ checked: documents.length, sent, purgedRateLimits })
}

export { handle as GET, handle as POST }
