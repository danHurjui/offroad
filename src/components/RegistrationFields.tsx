'use client'

import { useTranslations } from 'next-intl'
import { FUEL_TYPES, PLATE_MAX_LENGTH, COLOUR_MAX_LENGTH, RANGES, TRANSMISSIONS, kwToCp } from '@/lib/vehicleProfile'

export interface RegistrationValues {
  plate: string
  firstRegistrationDate: string
  fuelType: string
  transmission: string
  engineCapacityCc: string
  powerKw: string
  colour: string
  seats: string
}

/** Form state from what the server holds. */
export function registrationValuesFrom(vehicle: {
  plate: string | null
  firstRegistrationDate: string | null
  fuelType: string | null
  transmission: string | null
  engineCapacityCc: number | null
  powerKw: number | null
  colour: string | null
  seats: number | null
}): RegistrationValues {
  return {
    plate: vehicle.plate ?? '',
    firstRegistrationDate: vehicle.firstRegistrationDate ? vehicle.firstRegistrationDate.slice(0, 10) : '',
    fuelType: vehicle.fuelType ?? '',
    transmission: vehicle.transmission ?? '',
    engineCapacityCc: vehicle.engineCapacityCc?.toString() ?? '',
    powerKw: vehicle.powerKw?.toString() ?? '',
    colour: vehicle.colour ?? '',
    seats: vehicle.seats?.toString() ?? '',
  }
}

/** The plate input alone — the create form offers only this. */
export function PlateField({ value, onChange }: { value: string; onChange: (plate: string) => void }) {
  const t = useTranslations('vehicleProfile')
  return (
    <div>
      <label className="label" htmlFor="plate">{t('plate')}</label>
      <input
        id="plate"
        name="plate"
        className="input font-mono uppercase"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={t('platePlaceholder')}
        maxLength={PLATE_MAX_LENGTH}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-describedby="plate-help"
      />
      <p id="plate-help" className="mt-1 text-xs text-ink-faint">{t('plateHelp')}</p>
    </div>
  )
}

/**
 * RL-050: the talon fields. Everything optional; an empty field is sent as
 * empty and cleared on the server (src/lib/vehicleProfile.ts).
 */
export default function RegistrationFields({
  values,
  onChange,
}: {
  values: RegistrationValues
  onChange: (values: RegistrationValues) => void
}) {
  const t = useTranslations('vehicleProfile')
  const set = (patch: Partial<RegistrationValues>) => onChange({ ...values, ...patch })
  const kw = Number(values.powerKw)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 font-semibold text-ink">{t('heading')}</legend>
      <PlateField value={values.plate} onChange={(plate) => set({ plate })} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="firstRegistrationDate">{t('firstRegistrationDate')}</label>
          <input
            id="firstRegistrationDate"
            type="date"
            className="input"
            value={values.firstRegistrationDate}
            max={today}
            onChange={(e) => set({ firstRegistrationDate: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="fuelType">{t('fuelType')}</label>
          <select id="fuelType" className="input" value={values.fuelType} onChange={(e) => set({ fuelType: e.target.value })}>
            <option value="">{t('notSet')}</option>
            {FUEL_TYPES.map((code) => (
              <option key={code} value={code}>{t(`fuel.${code}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="transmission">{t('transmission')}</label>
          <select id="transmission" className="input" value={values.transmission} onChange={(e) => set({ transmission: e.target.value })}>
            <option value="">{t('notSet')}</option>
            {TRANSMISSIONS.map((code) => (
              <option key={code} value={code}>{t(`gearbox.${code}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="engineCapacityCc">{t('engineCapacityCc')}</label>
          <input
            id="engineCapacityCc"
            type="number"
            inputMode="numeric"
            className="input"
            value={values.engineCapacityCc}
            min={RANGES.engineCapacityCc.min}
            max={RANGES.engineCapacityCc.max}
            step={1}
            onChange={(e) => set({ engineCapacityCc: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="powerKw">{t('powerKw')}</label>
          <input
            id="powerKw"
            type="number"
            inputMode="numeric"
            className="input"
            value={values.powerKw}
            min={RANGES.powerKw.min}
            max={RANGES.powerKw.max}
            step={1}
            aria-describedby="powerKw-cp"
            onChange={(e) => set({ powerKw: e.target.value })}
          />
          {/* The talon states kW; listings and people say CP. */}
          <p id="powerKw-cp" className="mt-1 text-xs text-ink-faint" aria-live="polite">
            {Number.isInteger(kw) && kw > 0 ? t('powerCp', { cp: kwToCp(kw) }) : ' '}
          </p>
        </div>
        <div>
          <label className="label" htmlFor="colour">{t('colour')}</label>
          <input
            id="colour"
            className="input"
            value={values.colour}
            maxLength={COLOUR_MAX_LENGTH}
            autoComplete="off"
            onChange={(e) => set({ colour: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="seats">{t('seats')}</label>
          <input
            id="seats"
            type="number"
            inputMode="numeric"
            className="input"
            value={values.seats}
            min={RANGES.seats.min}
            max={RANGES.seats.max}
            step={1}
            onChange={(e) => set({ seats: e.target.value })}
          />
        </div>
      </div>
    </fieldset>
  )
}
