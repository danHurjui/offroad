import type { ProjectType } from './projectType'

/**
 * Suggestion lists for the make/model fields on the vehicle forms.
 *
 * These are a typing shortcut and nothing more — the fields stay free text,
 * no route validates against these lists, and none of it is stored. A
 * vehicle that isn't here is not a second-class vehicle; it just doesn't get
 * a dropdown.
 *
 * Skewed to the Romanian market this app is built for (the app's copy and
 * PDF exports are already Romanian-first), which is why ARO, Dacia, Oltcit
 * and the Eastern-bloc classics lead the restoration list rather than the
 * usual Western picks.
 *
 * `Record<ProjectType, ...>` rather than an if/else, so adding a fourth mode
 * to PROJECT_TYPE_CONFIG makes tsc name this file instead of silently
 * shipping an empty list.
 */

export const MAKE_SUGGESTIONS: Record<ProjectType, readonly string[]> = {
  OFFROAD: [
    'ARO', 'Dacia', 'Ford', 'Isuzu', 'Jeep', 'Lada', 'Land Rover', 'Mercedes-Benz',
    'Mitsubishi', 'Nissan', 'Opel', 'Suzuki', 'Toyota', 'UAZ', 'Volkswagen',
  ],
  RESTORATION: [
    'ARO', 'Dacia', 'Fiat', 'Ford', 'GAZ', 'Lada', 'Mercedes-Benz', 'Moskvich',
    'Oltcit', 'Opel', 'Skoda', 'Trabant', 'Volkswagen', 'Volga', 'Wartburg', 'Zastava',
  ],
  DAILY_DRIVER: [
    'Audi', 'BMW', 'Citroën', 'Dacia', 'Fiat', 'Ford', 'Honda', 'Hyundai', 'Kia',
    'Mazda', 'Mercedes-Benz', 'Nissan', 'Opel', 'Peugeot', 'Renault', 'Seat',
    'Skoda', 'Toyota', 'Volkswagen', 'Volvo',
  ],
}

/**
 * Models per make. Keyed on the lowercased make so "dacia", "Dacia" and a
 * stray trailing space all hit the same entry — people type these by hand.
 */
const MODELS_BY_MAKE: Record<string, readonly string[]> = {
  aro: ['240', '243', '244', '320', '10.1', '10.4', 'Spartana'],
  dacia: ['1300', '1310', '1410', 'Duster', 'Lodgy', 'Logan', 'Papuc', 'Sandero', 'Solenza', 'Spring'],
  jeep: ['Cherokee', 'Cherokee XJ', 'CJ-7', 'Grand Cherokee', 'Renegade', 'Wrangler JK', 'Wrangler TJ', 'Wrangler YJ'],
  'land rover': ['Defender 90', 'Defender 110', 'Discovery 1', 'Discovery 2', 'Freelander', 'Range Rover Classic', 'Series III'],
  lada: ['1200', '2101', '2107', 'Niva', 'Niva 4x4', 'Samara'],
  mitsubishi: ['L200', 'Outlander', 'Pajero', 'Pajero Sport'],
  nissan: ['Navara', 'Patrol GR', 'Patrol Y60', 'Patrol Y61', 'Qashqai', 'Terrano', 'X-Trail'],
  suzuki: ['Grand Vitara', 'Jimny', 'Samurai', 'SJ410', 'SJ413', 'Vitara'],
  toyota: ['4Runner', 'Corolla', 'Hilux', 'Land Cruiser 70', 'Land Cruiser 80', 'Land Cruiser 90', 'Land Cruiser 120', 'RAV4', 'Yaris'],
  uaz: ['452 Buhanka', '469', 'Hunter', 'Patriot'],
  volkswagen: ['Amarok', 'Beetle', 'Golf', 'Passat', 'Polo', 'Tiguan', 'Touareg', 'Transporter'],
  'mercedes-benz': ['190', 'A-Class', 'C-Class', 'E-Class', 'G-Class', 'ML', 'Sprinter', 'Vito'],
  skoda: ['105', '120', 'Fabia', 'Felicia', 'Octavia', 'Rapid', 'Superb'],
  ford: ['Bronco', 'Fiesta', 'Focus', 'Kuga', 'Mondeo', 'Ranger', 'Transit'],
  opel: ['Astra', 'Corsa', 'Frontera', 'Insignia', 'Kadett', 'Vectra'],
  renault: ['Captur', 'Clio', 'Espace', 'Kangoo', 'Laguna', 'Mégane', 'Scénic'],
  bmw: ['Seria 1', 'Seria 3', 'Seria 5', 'Seria 7', 'X1', 'X3', 'X5'],
  audi: ['A3', 'A4', 'A6', 'Q3', 'Q5', 'Q7'],
  fiat: ['126', '500', 'Panda', 'Punto', 'Tipo'],
  peugeot: ['206', '207', '307', '308', '2008', '3008'],
  citroën: ['Berlingo', 'C3', 'C4', 'C5', 'Xsara'],
  citroen: ['Berlingo', 'C3', 'C4', 'C5', 'Xsara'],
  oltcit: ['Club', 'Special'],
  trabant: ['601', 'P50'],
  wartburg: ['311', '353'],
  moskvich: ['407', '408', '412', '2140'],
  volga: ['GAZ-21', 'GAZ-24'],
  gaz: ['69', 'M20 Pobeda'],
  zastava: ['101', '750', 'Yugo'],
  hyundai: ['i20', 'i30', 'Kona', 'Tucson'],
  kia: ['Ceed', 'Rio', 'Sorento', 'Sportage'],
  seat: ['Ibiza', 'Leon', 'Toledo'],
  mazda: ['2', '3', '6', 'CX-5', 'MX-5'],
  honda: ['Accord', 'Civic', 'CR-V', 'HR-V'],
  volvo: ['S60', 'V40', 'V70', 'XC60', 'XC90'],
  isuzu: ['D-Max', 'Trooper'],
}

/** Models for a typed-in make; empty when the make isn't one we know. */
export function modelSuggestionsFor(make: string): readonly string[] {
  return MODELS_BY_MAKE[make.trim().toLowerCase()] ?? []
}

/**
 * Every make in one sorted, de-duplicated list, for the community
 * parts-wanted board — that board is not scoped to a project mode, so it
 * has no single list to pick from.
 */
export const ALL_MAKES: readonly string[] = Array.from(
  new Set(Object.values(MAKE_SUGGESTIONS).flat())
).sort((a, b) => a.localeCompare(b, 'ro'))
