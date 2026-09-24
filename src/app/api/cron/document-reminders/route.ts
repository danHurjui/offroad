import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/apiError'
import { prisma } from '@/lib/prisma'
import { managersSelect, vehicleManagers } from '@/lib/access'
import { translator } from '@/i18n/translator'
import { decideReminder, daysUntilMessage, getDocumentStatus, REMINDER_FIELDS } from '@/lib/documents'
import { sendEmail, documentReminderEmail, batteryWarrantyReminderEmail, emailLocale } from '@/lib/email'
import { warrantyStatus } from '@/lib/batteryHealth'
import { powertrainOf, takesCharge } from '@/lib/powertrain'
import type { Locale } from '@/i18n/config'
import { purgeExpiredRateLimits } from '@/lib/rateLimit'
import { appUrlForNotification } from '@/lib/appUrl'
import { sendPushNotification } from '@/lib/webpush'

/**
 * RL-013: document reminders at 30/14/3 days before expiry, delivered by
 * email and (#100) Web Push to every device each recipient subscribed.
 * Not user-facing.
 *
 * vercel.json wires a daily Vercel Cron job at this path when deployed
 * there — Vercel invokes cron routes with GET and, when CRON_SECRET is
 * set as a project env var, automatically adds `Authorization: Bearer
 * $CRON_SECRET` (see https://vercel.com/docs/cron-jobs/manage-cron-jobs
 * #securing-cron-jobs). Off Vercel, call it yourself (a crontab, GitHub
 * Actions, curl) with either that header or `x-cron-secret: $CRON_SECRET`
 * — POST is accepted too, for manual/non-GET callers.
 *
 * Push rides the same decision as the email: it is sent inside the loop
 * that has already marked the thresholds, so it can never be a second send
 * path with its own idea of what is due. Without VAPID keys it does nothing.
 */
/**
 * Constant-time secret check. A plain `!==` short-circuits on the first
 * differing byte, which leaks the secret to a timing oracle one byte at a
 * time (#116). Length-guard first because timingSafeEqual throws on a
 * length mismatch, and compare as bytes so an equal-length wrong secret
 * still takes the same time.
 */
function secretMatches(presented: string | null | undefined, expected: string | undefined): boolean {
  if (!presented || !expected) return false
  const a = Buffer.from(presented)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function handle(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const secret = bearer ?? req.headers.get('x-cron-secret')
  if (!secretMatches(secret, process.env.CRON_SECRET)) {
    return await apiError('unauthorized', 401)
  }

  const documents = await prisma.document.findMany({
    where: {
      // Any threshold still unsent. Derived from the milestone list so a
      // new one is picked up without editing this filter.
      OR: REMINDER_FIELDS.map((field) => ({ [field]: null })),
    },
    include: {
      // RL-038: a company vehicle's reminders go to the people who manage it.
      vehicle: { select: { id: true, make: true, model: true, year: true, ...managersSelect({
          email: true,
          locale: true,
          pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
        }), } },
    },
  })

  const baseUrl = appUrlForNotification('the document reminder email')
  let sent = 0
  let pushed = 0

  // Bail out of the whole loop rather than skipping sends inside it. The
  // reminderNSentAt fields are marked *before* the email goes out, so
  // marking without sending would consume the reminder permanently — the
  // owner would simply never be told their ITP was expiring. Doing nothing
  // leaves every threshold unmarked for the next run to pick up once the
  // URL is configured.
  for (const doc of baseUrl ? documents : []) {
    const { daysUntil } = getDocumentStatus(doc.expiryDate)
    const decision = decideReminder(daysUntil, doc)
    if (!decision.shouldSend) continue

    const data: Record<string, Date> = {}
    for (const field of decision.fieldsToMarkSent) data[field] = new Date()
    await prisma.document.update({ where: { id: doc.id }, data })

    // Each recipient's language, not the cron job's: this runs nightly with
    // no browser and no cookie anywhere near it.
    const days = daysUntilMessage(daysUntil)
    for (const recipient of vehicleManagers(doc.vehicle)) {
      const locale = emailLocale(recipient)
      const tDoc = await translator(locale, 'documents')
      const { subject, html } = await documentReminderEmail(locale, {
        documentLabel: tDoc(`type.${doc.type}`),
        vehicleName: `${doc.vehicle.year} ${doc.vehicle.make} ${doc.vehicle.model}`,
        daysUntilLabel: tDoc(days.key, days.values),
        vehicleUrl: `${baseUrl}/dashboard/vehicles/${doc.vehicle.id}/documents`,
      })
      // One recipient's failed send must not cost the others theirs (RL-039:
      // a company vehicle has several). The thresholds are already marked,
      // so nobody gets a duplicate; a failed send misses this one reminder.
      try {
        await sendEmail({ to: recipient.email, subject, html })
        sent++
      } catch (e) {
        console.error('[cron] document reminder not delivered:', e)
      }

      // After the email and independent of it: a failed email does not
      // cost the push, and a failed push costs neither the email nor the
      // next recipient. A dead subscription (404/410) is deleted.
      if (recipient.pushSubscriptions.length > 0) {
        const tPush = await translator(locale, 'notify')
        const payload = {
          title: tPush('documentReminderTitle', { document: tDoc(`type.${doc.type}`), daysUntil: tDoc(days.key, days.values) }),
          body: tPush('documentReminderBody', { vehicle: `${doc.vehicle.year} ${doc.vehicle.make} ${doc.vehicle.model}` }),
          url: `${baseUrl}/dashboard/vehicles/${doc.vehicle.id}/documents`,
        }
        for (const sub of recipient.pushSubscriptions) {
          try {
            const result = await sendPushNotification(sub, payload)
            if (result === 'sent') pushed++
            if (result === 'gone') await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
          } catch (e) {
            console.error('[cron] document reminder push not delivered:', e)
          }
        }
      }
    }
  }

  const batteryWarranty = baseUrl ? await remindBatteryWarranties(baseUrl) : { sent: 0, pushed: 0 }
  sent += batteryWarranty.sent
  pushed += batteryWarranty.pushed

  // Piggyback the rate-limit sweep on the daily cron rather than adding a
  // second scheduled function — elapsed windows are dead rows, and Vercel's
  // Hobby plan allows only a limited number of cron jobs.
  const purgedRateLimits = await purgeExpiredRateLimits()

  return NextResponse.json({
    checked: documents.length,
    sent,
    pushed,
    purgedRateLimits,
    // Surfaced so a scheduled run that silently sent nothing is visible in
    // the cron log rather than looking like a quiet success.
    ...(baseUrl ? {} : { skipped: 'No usable public URL configured; no reminders were sent or marked.' }),
  })
}

/**
 * RL-056: one reminder per set of warranty terms, when the traction-battery
 * warranty comes inside 90 days or 5,000 km of whichever limit is first —
 * the same `warrantyStatus()` Car Health's row reads, so the email never
 * says something the screen does not. Only for a vehicle that plugs in.
 *
 * `batteryWarrantyRemindedAt` is marked before sending (a failed send
 * misses this one reminder rather than repeating it nightly), and the
 * warranty PUT clears it when the terms change, which re-arms it. A
 * warranty already ended, or with no current km to measure, sends nothing.
 * Folded into this job rather than a second cron: Vercel's Hobby plan
 * allows few.
 */
async function remindBatteryWarranties(baseUrl: string): Promise<{ sent: number; pushed: number }> {
  const vehicles = await prisma.vehicle.findMany({
    where: {
      batteryWarrantyRemindedAt: null,
      OR: [{ batteryWarrantyUntil: { not: null } }, { batteryWarrantyKm: { not: null } }],
    },
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      fuelType: true,
      batteryWarrantyUntil: true,
      batteryWarrantyKm: true,
      odometerReadings: { select: { km: true, readAt: true, isOverride: true, createdAt: true } },
      ...managersSelect({
        email: true,
        locale: true,
        pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
      }),
    },
  })
  let sent = 0
  let pushed = 0
  const now = new Date()
  for (const vehicle of vehicles) {
    if (!takesCharge(powertrainOf(vehicle.fuelType))) continue
    const status = warrantyStatus(vehicle.batteryWarrantyUntil, vehicle.batteryWarrantyKm, vehicle.odometerReadings, now)
    if (status.state !== 'soon') continue
    await prisma.vehicle.update({ where: { id: vehicle.id }, data: { batteryWarrantyRemindedAt: now } })

    const name = `${vehicle.year} ${vehicle.make} ${vehicle.model}`
    const url = `${baseUrl}/dashboard/vehicles/${vehicle.id}/battery`
    for (const recipient of vehicleManagers(vehicle)) {
      const locale = emailLocale(recipient)
      const detail = await warrantyDetail(locale, vehicle.batteryWarrantyUntil, vehicle.batteryWarrantyKm, status.daysLeft, status.kmLeft)
      const { subject, html } = await batteryWarrantyReminderEmail(locale, { vehicleName: name, detail, vehicleUrl: url })
      try {
        await sendEmail({ to: recipient.email, subject, html })
        sent++
      } catch (e) {
        console.error('[cron] battery warranty reminder not delivered:', e)
      }
      if (recipient.pushSubscriptions.length > 0) {
        const tPush = await translator(locale, 'notify')
        const payload = { title: tPush('batteryWarrantyTitle', { vehicle: name }), body: detail, url }
        for (const sub of recipient.pushSubscriptions) {
          try {
            const result = await sendPushNotification(sub, payload)
            if (result === 'sent') pushed++
            if (result === 'gone') await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
          } catch (e) {
            console.error('[cron] battery warranty push not delivered:', e)
          }
        }
      }
    }
  }
  return { sent, pushed }
}

/** "until 12.03.2031 (60 days left) or 160.000 km (3.000 km left), whichever comes first", in the recipient's language. */
async function warrantyDetail(locale: Locale, until: Date | null, limitKm: number | null, daysLeft: number | null, kmLeft: number | null): Promise<string> {
  const t = await translator(locale, 'email')
  const date = until ? until.toLocaleDateString('ro-RO', { timeZone: 'UTC' }) : ''
  const km = (n: number) => n.toLocaleString('ro-RO')
  const byDate = daysLeft !== null ? t('batteryWarranty.byDate', { date, days: daysLeft }) : null
  const byKm = kmLeft !== null && limitKm !== null ? t('batteryWarranty.byKm', { limitKm: km(limitKm), km: km(kmLeft) }) : null
  return byDate && byKm ? t('batteryWarranty.whicheverFirst', { byDate, byKm }) : (byDate ?? byKm ?? '')
}

export { handle as GET, handle as POST }
