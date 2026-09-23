import { prisma } from '@/lib/prisma'
import { translator } from '@/i18n/translator'
import { appUrlForNotification } from '@/lib/appUrl'
import { inviteeLocale, organizationInviteEmail, sendEmail } from '@/lib/email'
import { orgInviteAcceptUrl } from '@/lib/organizationInvites'

/**
 * Mails an invitation. The row exists either way; with no public URL
 * configured nothing is sent (a dead accept link is worse than silence),
 * and the owner resends once it is.
 */
export async function sendOrganizationInvite(input: {
  inviterId: string
  organizationName: string
  email: string
  role: string
  token: string
}) {
  const baseUrl = appUrlForNotification('the organisation invitation email')
  if (!baseUrl) return
  const [inviter, invitee] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.inviterId }, select: { displayName: true, locale: true } }),
    prisma.user.findUnique({ where: { email: input.email }, select: { locale: true } }),
  ])
  const locale = inviteeLocale(invitee, inviter)
  const tEmail = await translator(locale, 'email')
  const { subject, html } = await organizationInviteEmail(locale, {
    inviterName: inviter?.displayName ?? tEmail('collaboratorInvite.someone'),
    organizationName: input.organizationName,
    role: input.role,
    acceptUrl: orgInviteAcceptUrl(input.token, baseUrl),
  })
  await sendEmail({ to: input.email, subject, html })
}
