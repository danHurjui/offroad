import type { FuelType } from './vehicleProfile'

/**
 * RL-052 (#120): what a vehicle runs on, as the rest of the app needs to
 * ask it — does it take fuel, does it take a charge, or both.
 *
 * `Vehicle.fuelType` is the talon's answer and stays a label. This is the
 * one place that turns it into behaviour, the way `PROJECT_TYPE_CONFIG`
 * is the one place a mode turns into vocabulary: a screen that compares
 * `fuelType` itself is a screen that forgets plug-in hybrids exist, so
 * `powertrain.test.ts` fails on any `fuelType ===` outside this file.
 *
 * A vehicle with no fuel type is `UNKNOWN`, and `UNKNOWN` takes fuel —
 * most vehicles have never had the field filled in, and every one of them
 * must keep behaving exactly as it did before this existed.
 */

export const POWERTRAINS = ['COMBUSTION', 'HYBRID', 'PLUGIN_HYBRID', 'ELECTRIC', 'UNKNOWN'] as const
export type Powertrain = (typeof POWERTRAINS)[number]

/** Typed as a full Record so `tsc` names any fuel type left out. */
const BY_FUEL: Record<FuelType, Powertrain> = {
  PETROL: 'COMBUSTION',
  DIESEL: 'COMBUSTION',
  LPG: 'COMBUSTION',
  // A regular hybrid only ever takes fuel; its battery charges itself.
  HYBRID: 'HYBRID',
  PLUGIN_HYBRID: 'PLUGIN_HYBRID',
  ELECTRIC: 'ELECTRIC',
  OTHER: 'UNKNOWN',
}

const CAPABILITIES: Record<Powertrain, { fuel: boolean; charge: boolean }> = {
  COMBUSTION: { fuel: true, charge: false },
  HYBRID: { fuel: true, charge: false },
  PLUGIN_HYBRID: { fuel: true, charge: true },
  ELECTRIC: { fuel: false, charge: true },
  UNKNOWN: { fuel: true, charge: false },
}

export function powertrainOf(fuelType: string | null | undefined): Powertrain {
  if (!fuelType) return 'UNKNOWN'
  return (BY_FUEL as Record<string, Powertrain>)[fuelType] ?? 'UNKNOWN'
}

/** It has a tank: the fuel log applies. */
export function takesFuel(powertrain: Powertrain): boolean {
  return CAPABILITIES[powertrain].fuel
}

/** It plugs in: battery, connectors and (RL-053) the charging log apply. */
export function takesCharge(powertrain: Powertrain): boolean {
  return CAPABILITIES[powertrain].charge
}

/** An engine's displacement means something for it. */
export function hasEngine(powertrain: Powertrain): boolean {
  return powertrain !== 'ELECTRIC'
}
