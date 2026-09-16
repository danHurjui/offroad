import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { TICKET_TYPES, TICKET_STATUSES, type TicketStatus } from '@/lib/tickets'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import TicketVoteButton from '@/components/TicketVoteButton'
import TicketComments from '@/components/TicketComments'
import TicketAdminPanel from '@/components/TicketAdminPanel'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const tv = await getTranslations('ticketVocab')
  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    select: { title: true, type: true },
  })
  if (!ticket) return { title: 'Ticket not found — RigLog' }
  return {
    title: `${ticket.title} — RigLog roadmap`,
    description: `${tv(`type.${ticket.type}.label`)} on the RigLog public roadmap.`,
  }
}

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const tv = await getTranslations('ticketVocab')
  const session = await getServerSession(authOptions)

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: {
      author: { select: { displayName: true } },
      _count: { select: { votes: true } },
      votes: session ? { where: { userId: session.user.id }, select: { id: true } } : false,
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { displayName: true } } },
      },
    },
  })
  if (!ticket) notFound()

  const viewer = session
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } })
    : null
  const isAdmin = Boolean(viewer?.isAdmin)

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/tickets" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
          ← Back to the roadmap
        </Link>

        <div className="card mb-6 flex items-start gap-4 p-5">
          <TicketVoteButton
            ticketId={ticket.id}
            initialVoted={Array.isArray(ticket.votes) && ticket.votes.length > 0}
            initialCount={ticket._count.votes}
            signedIn={Boolean(session)}
          />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`badge ${TICKET_TYPES[ticket.type].badgeClass}`}>
                {tv(`type.${ticket.type}.label`)}
              </span>
              <span className={`badge ${TICKET_STATUSES[ticket.status].badgeClass}`}>
                {tv(`status.${ticket.status}`)}
              </span>
            </div>
            <h1 className="text-xl font-bold text-ink sm:text-2xl">{ticket.title}</h1>
            <p className="mt-1 text-xs text-ink-faint">
              Opened by {ticket.author.displayName} on{' '}
              {new Date(ticket.createdAt).toLocaleDateString('ro-RO')}
            </p>
            <p className="mt-4 whitespace-pre-wrap text-sm text-ink-muted">{ticket.description}</p>
          </div>
        </div>

        {ticket.adminNote && (
          <div className="card mb-6 note p-4">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-200">
              Note from RigLog
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink">{ticket.adminNote}</p>
          </div>
        )}

        {isAdmin && (
          <TicketAdminPanel
            ticketId={ticket.id}
            currentStatus={ticket.status as TicketStatus}
            currentNote={ticket.adminNote}
          />
        )}

        <TicketComments
          ticketId={ticket.id}
          signedIn={Boolean(session)}
          comments={ticket.comments.map((c) => ({
            id: c.id,
            body: c.body,
            isStaff: c.isStaff,
            authorName: c.user.displayName,
            createdAt: c.createdAt.toISOString(),
          }))}
        />
      </main>

      <PublicFooter />
    </div>
  )
}
