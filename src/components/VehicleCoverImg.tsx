// Uploaded photos are only ever served through /api/uploads/[...path]
// (access-checked), never a static /uploads rewrite — see CLAUDE.md.
export default function VehicleCoverImg({
  url,
  alt,
}: {
  url: string | null
  alt: string
}) {
  if (!url) {
    return (
      <div className="flex h-40 items-center justify-center bg-surface-subtle text-sm text-ink-faint">
        No cover photo
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/uploads/${url}`} alt={alt} className="h-40 w-full object-cover" />
}
