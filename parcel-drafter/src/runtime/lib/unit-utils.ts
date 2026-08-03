/** Port of length/area unit conversion logic from WAB ParcelDrafter/utils.js. */

export type LengthUnit = 'meters' | 'feet' | 'uSSurveyFeet'

export interface LengthConversions {
  meters: number
  feet: number
  uSSurveyFeet: number
  metersRound: string
  feetRound: string
  uSSurveyFeetRound: string
  originalInput: string
}

// Same constants as WAB utils.js
export const metersToUSSurveyFeet = (m: number): number => Number(m) * 3.28083333333
export const usSurveyFeetToMeters = (ft: number): number => Number(ft) / 3.28083333333
export const feetToMeters = (ft: number): number => Number(ft) * 0.3048
export const metersToFeet = (m: number): number => Number(m) / 0.3048
export const feetToUSSurveyFeet = (ft: number): number => metersToUSSurveyFeet(feetToMeters(ft))
export const usSurveyFeetToFeet = (usft: number): number => metersToFeet(usSurveyFeetToMeters(usft))
// Surveyor's units for historic deed calls (same factors as the Polk County traverse widget)
export const chainsToMeters = (ch: number): number => Number(ch) * 20.1168
export const rodsToMeters = (rd: number): number => Number(rd) * 5.0292

export function showFixedPlacesAfterDecimal (num: number, places: number): number {
  return parseFloat(Number(num).toFixed(places))
}

/**
 * Parse a length string entered in the plan's current unit; supports explicit unit
 * suffixes m / ft / usft / ch (chains) / rd (rods), case-insensitive,
 * e.g. "100m", "328.08ft", "4ch", "12rd". Chains and rods are input-only units
 * for historic deed calls; values convert to meters on entry.
 * Returns conversions to all units, or null if invalid.
 */
export function categorizeLengthFormat (length: string | number, currentUnit: LengthUnit): LengthConversions | null {
  const raw = String(length).trim()
  let unit: LengthUnit = currentUnit
  let numericPart = raw

  const suffixMatch = /^(-?\d*\.?\d+)\s*(m|ft|usft|ch|rd)?$/i.exec(raw)
  if (!suffixMatch) return null
  numericPart = suffixMatch[1]
  let inputOnlyMeters: number | null = null
  const value = Number(numericPart)
  if (isNaN(value)) return null
  if (suffixMatch[2]) {
    const s = suffixMatch[2].toLowerCase()
    if (s === 'ch') inputOnlyMeters = chainsToMeters(value)
    else if (s === 'rd') inputOnlyMeters = rodsToMeters(value)
    else unit = s === 'm' ? 'meters' : s === 'ft' ? 'feet' : 'uSSurveyFeet'
  }

  let meters: number
  if (inputOnlyMeters !== null) {
    meters = inputOnlyMeters
  } else {
    switch (unit) {
      case 'meters': meters = value; break
      case 'feet': meters = feetToMeters(value); break
      case 'uSSurveyFeet': meters = usSurveyFeetToMeters(value); break
    }
  }

  const feet = metersToFeet(meters)
  const usft = metersToUSSurveyFeet(meters)
  return {
    meters,
    feet,
    uSSurveyFeet: usft,
    metersRound: meters.toFixed(2),
    feetRound: feet.toFixed(2),
    uSSurveyFeetRound: usft.toFixed(2),
    originalInput: raw
  }
}

export function getLengthForUnit (c: LengthConversions, unit: LengthUnit): number {
  return unit === 'meters' ? c.meters : unit === 'feet' ? c.feet : c.uSSurveyFeet
}

export function getAbbreviatedUnits (units: string): string {
  switch (units) {
    case 'meters': return 'm'
    case 'feet': return 'ft'
    case 'uSSurveyFeet': return 'usft'
    case 'acres': return 'ac'
    case 'squareMeters': return 'sqm'
    case 'squareFeet': return 'sqft'
    case 'squareUSSurveyFeet': return 'squsft'
    default: return units
  }
}
