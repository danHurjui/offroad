// RL-019: shown on the vehicle dashboard and the public profile
// (restoration mode, Pro owners only — see both call sites).
export default function OriginalityBadge({ score }: { score: number | null }) {
  return (
    <span
      className="badge cursor-help bg-surface-subtle text-ink-muted"
      title="Originality score = OEM original parts / all completed tasks. Useful for buyers and concours judges — a rough measure of how much of the car is still factory-original."
    >
      Originality: {score === null ? 'not rated' : `${score}%`}
    </span>
  )
}
