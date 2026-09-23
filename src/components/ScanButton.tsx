'use client'

import type { ScanProgress } from '@/lib/ocr'

/**
 * RL-048: the camera button that starts a scan, shared by the fuel form and
 * the job form. The file input sits inside its label, so the whole button
 * is the target and keyboard focus shows on it.
 */
export function ScanButton({
  idle,
  reading,
  readingAgain,
  help,
  helpId,
  progress,
  onFile,
}: {
  idle: string
  reading: (percent: number) => string
  readingAgain: (percent: number) => string
  help: string
  helpId: string
  progress: ScanProgress | null
  onFile: (file: File) => void
}) {
  const percent = progress ? Math.round(progress.fraction * 100) : 0
  return (
    <div>
      <label className="btn-secondary inline-flex cursor-pointer items-center focus-within:ring-2 focus-within:ring-brand-500">
        {progress === null ? idle : progress.pass === 1 ? reading(percent) : readingAgain(percent)}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-describedby={helpId}
          disabled={progress !== null}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onFile(file)
          }}
        />
      </label>
      <p id={helpId} className="mt-1 text-xs text-ink-faint">
        {help}
      </p>
    </div>
  )
}

/** The flag under a field a scan could not read with confidence. */
export function ScanFlag({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} className="note-warn mt-1 rounded border px-2 py-1 text-xs text-ink">
      {children}
    </p>
  )
}
