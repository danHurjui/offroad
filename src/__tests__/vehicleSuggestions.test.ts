import { ALL_MAKES, MAKE_SUGGESTIONS, modelSuggestionsFor } from '@/lib/vehicleSuggestions'
import { PROJECT_TYPES } from '@/lib/projectType'

describe('MAKE_SUGGESTIONS', () => {
  // Typed as Record<ProjectType, ...> so tsc catches a missing mode, but a
  // mode present with an empty list would still compile.
  it('has a non-empty list for every project type', () => {
    for (const type of PROJECT_TYPES) {
      expect(MAKE_SUGGESTIONS[type].length).toBeGreaterThan(0)
    }
  })

  it('has no duplicates within a list', () => {
    for (const type of PROJECT_TYPES) {
      const list = MAKE_SUGGESTIONS[type]
      expect(new Set(list).size).toBe(list.length)
    }
  })

  // The Romanian market is the point — these two carry the local vehicles.
  it('leads with the local makes in the modes that need them', () => {
    expect(MAKE_SUGGESTIONS.OFFROAD).toContain('ARO')
    expect(MAKE_SUGGESTIONS.RESTORATION).toContain('Dacia')
    expect(MAKE_SUGGESTIONS.RESTORATION).toContain('Oltcit')
  })
})

describe('ALL_MAKES', () => {
  it('is the union of every mode with nothing repeated', () => {
    const union = new Set(PROJECT_TYPES.flatMap((t) => [...MAKE_SUGGESTIONS[t]]))
    expect(new Set(ALL_MAKES)).toEqual(union)
    expect(ALL_MAKES.length).toBe(union.size)
  })

  it('is sorted', () => {
    const sorted = [...ALL_MAKES].sort((a, b) => a.localeCompare(b, 'ro'))
    expect([...ALL_MAKES]).toEqual(sorted)
  })
})

describe('modelSuggestionsFor', () => {
  it('matches however the make was typed', () => {
    const expected = modelSuggestionsFor('Dacia')
    expect(expected.length).toBeGreaterThan(0)
    for (const spelling of ['dacia', 'DACIA', '  Dacia  ', 'dAcIa']) {
      expect(modelSuggestionsFor(spelling)).toEqual(expected)
    }
  })

  // An unknown make is normal, not an error — the field is free text.
  it('returns an empty list for a make it does not know', () => {
    expect(modelSuggestionsFor('Tatra')).toEqual([])
    expect(modelSuggestionsFor('')).toEqual([])
    expect(modelSuggestionsFor('   ')).toEqual([])
  })

  it('knows the local models', () => {
    expect(modelSuggestionsFor('ARO')).toContain('243')
    expect(modelSuggestionsFor('Dacia')).toContain('1310')
  })

  // A make offered in the dropdown that yields nothing on the next field
  // reads as broken; every suggested make should carry models.
  it('has models for every make it suggests', () => {
    const missing = ALL_MAKES.filter((make) => modelSuggestionsFor(make).length === 0)
    expect(missing).toEqual([])
  })
})
