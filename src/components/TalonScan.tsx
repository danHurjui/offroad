'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { ScanProgress } from '@/lib/ocr'
import { TALON_FIELDS, readAnythingFromTalon, type TalonField, type TalonProposal } from '@/lib/talonParse'
import { ScanButton } from './ScanButton'

/**
 * Scan the talon (the registration certificate) into the vehicle's
 * identity fields. The same engine as the receipt scanner (RL-048), read
 * on the device: the photo carries the holder's name, address and personal
 * number, and it is **never uploaded** — nothing here sends it anywhere,
 * and a test holds that. It proposes: the form is filled in, the person
 * checks it against the card, and nothing is saved until they save.
 */
export default function TalonScan({
  canScan,
  offerUpgrade,
  onProposal,
}: {
  canScan: boolean
  offerUpgrade: boolean
  /** Receives what was read; the form decides what to write where. */
  onProposal: (proposal: TalonProposal) => void
}) {
  const t = useTranslations('talonScan')
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [outcome, setOutcome] = useState<{ read: TalonField[]; unsure: TalonField[]; hybrid: boolean } | 'failed' | null>(null)

  async function onFile(file: File) {
    setOutcome(null)
    setProgress({ pass: 1, fraction: 0 })
    try {
      // Loaded only when somebody scans: the engine is not small.
      const { scanTalon } = await import('@/lib/ocr')
      const proposal = await scanTalon(file, setProgress)
      if (!readAnythingFromTalon(proposal)) throw new Error('nothing read')
      onProposal(proposal)
      setOutcome({
        read: TALON_FIELDS.filter((f) => proposal[f].state === 'read'),
        unsure: TALON_FIELDS.filter((f) => proposal[f].state === 'unsure'),
        hybrid: proposal.hybridAmbiguous,
      })
    } catch {
      setOutcome('failed')
    } finally {
      setProgress(null)
    }
  }

  if (!canScan) {
    return offerUpgrade ? (
      <p className="text-xs text-ink-faint">
        <Link href="/dashboard/upgrade" className="text-brand-600 hover:underline dark:text-brand-300">
          {t('upgrade')}
        </Link>
      </p>
    ) : null
  }

  const names = (fields: TalonField[]) => fields.map((f) => t(`field.${f}`)).join(', ')
  return (
    <div className="card p-4">
      <ScanButton
        idle={t('scan')}
        reading={(percent) => t('scanning', { percent })}
        readingAgain={(percent) => t('scanningAgain', { percent })}
        help={t('help')}
        helpId="talon-scan-help"
        progress={progress}
        onFile={(file) => void onFile(file)}
      />
      <div aria-live="polite">
        {outcome === 'failed' && <p className="note-warn mt-2 rounded-lg border p-3 text-sm">{t('failed')}</p>}
        {outcome && outcome !== 'failed' && (
          <div className="note-warn mt-2 space-y-1 rounded-lg border p-3 text-sm">
            {outcome.read.length > 0 && <p>{t('filled', { fields: names(outcome.read) })}</p>}
            {outcome.unsure.length > 0 && <p>{t('unsure', { fields: names(outcome.unsure) })}</p>}
            {outcome.hybrid && <p>{t('hybrid')}</p>}
            <p className="font-medium">{t('check')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
