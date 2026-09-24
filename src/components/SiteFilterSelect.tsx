import type { SiteOption } from '@/lib/sites'

/**
 * #103: the site filter the fleet pages and the reports form share — a
 * plain select in a GET form, so it works without script and the URL is
 * shareable. Rendered only when the organisation has sites.
 */
export default function SiteFilterSelect({
  id,
  sites,
  selected,
  label,
  allLabel,
}: {
  id: string
  sites: SiteOption[]
  selected: SiteOption | null
  label: string
  allLabel: string
}) {
  if (sites.length === 0) return null
  return (
    <div className="min-w-0">
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} name="site" className="input" defaultValue={selected?.id ?? ''}>
        <option value="">{allLabel}</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </div>
  )
}
