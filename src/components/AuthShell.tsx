import LanguageToggle from './LanguageToggle'

/**
 * The centred card every signed-out auth screen sits in.
 *
 * It exists for the language switcher. Someone who cannot read Romanian
 * has to be able to change the language *before* they have an account to
 * store the preference on — and these four pages are the only ones they
 * can reach. The in-app header (Nav) and the marketing header
 * (PublicHeader) carry their own copy; without this one, login would be
 * the single screen in the app with no way out of a language you don't
 * read.
 *
 * The theme toggle is deliberately not here: a dark-mode preference is
 * already applied from localStorage before first paint, so there is
 * nothing to fix from this screen.
 */
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4 py-10">
      <div className="mb-3 w-full max-w-sm text-right">
        <LanguageToggle compact />
      </div>
      {children}
    </div>
  )
}
