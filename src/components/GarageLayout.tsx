'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { GARAGE_DENSITIES, readGarageDensity, writeGarageDensity, type GarageDensity } from '@/lib/garageDensity'

/** Even reading `window.localStorage` can throw when site data is blocked. */
function storage(): Storage | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/**
 * RL-035: wraps the vehicle list and sets `data-density` on it; the cards
 * restyle themselves through `group-data-[density=compact]/garage:`
 * variants, so the server renders one list and nothing is fetched twice.
 * The toggle appears only once script has run — without it, it could not
 * do anything.
 */
export default function GarageLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('dashboard.garage')
  const [density, setDensity] = useState<GarageDensity>('cards')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setDensity(readGarageDensity(storage()))
    setReady(true)
  }, [])

  function choose(next: GarageDensity) {
    setDensity(next)
    writeGarageDensity(storage(), next)
  }

  return (
    <div className="group/garage" data-density={density}>
      {ready && (
        <div className="mb-3 flex justify-end">
          <div role="group" aria-label={t('density')} className="inline-flex overflow-hidden rounded-lg border border-surface-border text-sm">
            {GARAGE_DENSITIES.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={density === d}
                onClick={() => choose(d)}
                className={`px-3 py-1.5 ${density === d ? 'bg-brand-600 text-white' : 'bg-surface text-ink-muted hover:text-ink'}`}
              >
                {t(d === 'cards' ? 'densityCards' : 'densityCompact')}
              </button>
            ))}
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
