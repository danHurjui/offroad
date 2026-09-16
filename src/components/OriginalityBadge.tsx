import { getTranslations } from 'next-intl/server'

// RL-019: shown on the vehicle dashboard and the public profile
// (restoration mode, Pro owners only — see both call sites).
export default async function OriginalityBadge({ score }: { score: number | null }) {
  const t = await getTranslations('misc')
  return (
    <span
      className="badge cursor-help bg-surface-subtle text-ink-muted"
      title={t('originalityHelp')}
    >
      Originality: {score === null ? 'not rated' : `${score}%`}
    </span>
  )
}
