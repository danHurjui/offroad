import { getTranslations } from 'next-intl/server'
import { LogoMark } from './Logo'

// Uploaded photos are only ever served through /api/uploads/[...path]
// (access-checked), never a static /uploads rewrite — see CLAUDE.md.
export default async function VehicleCoverImg({
  url,
  alt,
}: {
  url: string | null
  alt: string
}) {
  const t = await getTranslations('misc')
  if (!url) {
    return (
      // Shorter than a photo on a phone, where the garage is one column and
      // a 160px grey slab per vehicle was most of the screen saying nothing.
      <div className="flex h-24 flex-col items-center justify-center gap-1 bg-gradient-to-br from-surface-subtle to-surface-muted text-xs text-ink-faint sm:h-40">
        <LogoMark className="h-8 w-8 opacity-40" />
        {t('noCoverPhoto')}
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/uploads/${url}`} alt={alt} className="h-40 w-full object-cover" />
}
