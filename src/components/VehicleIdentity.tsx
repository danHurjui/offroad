import { getTranslations } from 'next-intl/server'
import { isConnectorType, isFuelType, isTransmission, kwToCp } from '@/lib/vehicleProfile'
import { hasEngine, powertrainOf, takesCharge } from '@/lib/powertrain'

/**
 * RL-050: the plate as a plate. **Private screens only** — never import
 * this into a public page (vehicleProfile.test.ts reads those files).
 */
export function PlateBadge({ plate }: { plate: string | null }) {
  if (!plate) return null
  return <span className="plate">{plate}</span>
}

/**
 * One line of the talon — fuel · gearbox · cc · kW — showing only what
 * the owner filled in, and nothing at all when they filled in nothing.
 */
export async function RegistrationSummary({
  vehicle,
}: {
  vehicle: {
    fuelType: string | null
    transmission: string | null
    engineCapacityCc: number | null
    powerKw: number | null
    colour: string | null
    seats: number | null
    firstRegistrationDate: Date | null
    batteryCapacityKwh?: number | null
    connectorTypes?: string[]
  }
}) {
  const t = await getTranslations('vehicleProfile')
  const parts: string[] = []
  const powertrain = powertrainOf(vehicle.fuelType)
  if (isFuelType(vehicle.fuelType)) parts.push(t(`fuel.${vehicle.fuelType}`))
  if (isTransmission(vehicle.transmission)) parts.push(t(`gearbox.${vehicle.transmission}`))
  // RL-052: only what applies to this powertrain; a value kept after the
  // fuel type changed is not shown against the wrong one.
  if (takesCharge(powertrain) && vehicle.batteryCapacityKwh) {
    parts.push(t('summaryBattery', { kwh: vehicle.batteryCapacityKwh.toLocaleString('ro-RO') }))
  }
  if (takesCharge(powertrain) && vehicle.connectorTypes?.length) {
    parts.push(vehicle.connectorTypes.filter(isConnectorType).map((c) => t(`connector.${c}`)).join(', '))
  }
  if (hasEngine(powertrain) && vehicle.engineCapacityCc) parts.push(t('summaryCc', { cc: vehicle.engineCapacityCc.toLocaleString('ro-RO') }))
  if (vehicle.powerKw) parts.push(t('summaryKw', { kw: vehicle.powerKw, cp: kwToCp(vehicle.powerKw) }))
  if (vehicle.colour) parts.push(vehicle.colour)
  if (vehicle.seats) parts.push(t('summarySeats', { seats: vehicle.seats }))
  if (vehicle.firstRegistrationDate) {
    parts.push(`${t('firstRegistrationDate')} ${vehicle.firstRegistrationDate.toLocaleDateString('ro-RO')}`)
  }
  if (parts.length === 0) return null
  return <p className="mt-1 text-sm text-ink-faint">{parts.join(' · ')}</p>
}
