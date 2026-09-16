import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import PublicHeader from '@/components/PublicHeader'
import PublicFooter from '@/components/PublicFooter'
import TicketForm from '@/components/TicketForm'

export const metadata: Metadata = {
  title: 'Open a ticket — RigLog',
  robots: { index: false },
}

export default async function NewTicketPage() {
  // Posting needs an account so the ticket has an author and the implied
  // vote is attributable. Reading the board doesn't.
  const session = await getServerSession(authOptions)
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent('/tickets/new')}`)

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />

      <main className="mx-auto max-w-2xl px-4 py-10">
        <Link href="/tickets" className="mb-4 inline-block text-sm text-brand-600 dark:text-brand-300 hover:underline">
          ← Back to the roadmap
        </Link>
        <h1 className="mb-2 text-2xl font-bold text-ink">Open a ticket</h1>
        <p className="mb-6 text-ink-muted">
          The more specific you are, the more likely it gets fixed or built. Your ticket starts with your
          own vote on it.
        </p>
        <TicketForm />
      </main>

      <PublicFooter />
    </div>
  )
}
