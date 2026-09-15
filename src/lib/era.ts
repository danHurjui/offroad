/** RL-022: restoration-only era filter buckets for the community feed. */
export interface EraOption {
  value: string
  label: string
  min: number
  max: number
}

export const ERA_OPTIONS: EraOption[] = [
  { value: 'pre1970', label: 'Pre-1970', min: -Infinity, max: 1969 },
  { value: '1970s', label: '1970s', min: 1970, max: 1979 },
  { value: '1980s', label: '1980s', min: 1980, max: 1989 },
  { value: '1990s', label: '1990s', min: 1990, max: 1999 },
  { value: '2000s', label: '2000s', min: 2000, max: 2009 },
]

/** An unknown/empty era value matches everything (no filter applied). */
export function yearMatchesEra(year: number, eraValue: string): boolean {
  const era = ERA_OPTIONS.find((e) => e.value === eraValue)
  if (!era) return true
  return year >= era.min && year <= era.max
}
