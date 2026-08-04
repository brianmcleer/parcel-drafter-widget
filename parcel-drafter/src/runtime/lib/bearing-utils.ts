/**
 * Port of the bearing/length parsing & conversion logic in WAB ParcelDrafter/utils.js.
 * Supports the same input formats:
 *   dd-mm-ss-[1234]   [NS]dd-mm-ss[EW]   [NS]dd.mmss[EW]   dd.mmss   dd.dddd
 *   dd-mm-ss          dd.mmss-[1234]     [NS]dd.dddd[EW]   dd.dddd-[1234]
 * All bearings are normalized internally to North-Azimuth Decimal Degrees (naDD).
 */

export interface PlanSettings {
  directionOrAngleType: 'northAzimuth' | 'southAzimuth' | 'quadrantBearing'
  directionOrAngleUnits: 'decimalDegree' | 'degreeMinuteSeconds'
  distanceAndLengthUnits: 'meters' | 'feet' | 'uSSurveyFeet'
  areaUnits: 'acres' | 'squareMeters' | 'squareFeet' | 'squareUSSurveyFeet'
  circularCurveParameters: 'radiusAndChordLength' | 'radiusAndArcLength'
  expandedGrid?: boolean
}

export interface DMS { degree: number, minutes: number, seconds: number }

export interface BearingConversions {
  naDD: number // north azimuth decimal degrees - canonical value
  naDDRound: string
  saDD: number
  saDDRound: string
  naDMS: string
  saDMS: string
  qb3DD: string // quadrant bearing with N/S..E/W letters, decimal degrees
  qb3DDRound: string
  qb3DMS: string
  originalInput: string
}

// ---------------------------------------------------------------- DMS helpers

export function DMStoDD (dms: DMS): number {
  const sign = dms.degree < 0 ? -1 : 1
  return sign * (Math.abs(dms.degree) + dms.minutes / 60 + dms.seconds / 3600)
}

export function DDtoDMS (angle: number): DMS {
  const sign = angle < 0 ? -1 : 1
  let abs = Math.abs(angle)
  let degree = Math.floor(abs)
  let minutes = Math.floor((abs - degree) * 60)
  let seconds = Math.round(((abs - degree) * 60 - minutes) * 60 * 100) / 100
  // roll over rounding
  if (seconds >= 60) { seconds -= 60; minutes += 1 }
  if (minutes >= 60) { minutes -= 60; degree += 1 }
  return { degree: sign * degree, minutes, seconds }
}

function padDMS (dms: DMS): string {
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  const sec = Math.round(dms.seconds)
  const norm = { ...dms, seconds: sec }
  if (norm.seconds >= 60) { norm.seconds -= 60; norm.minutes += 1 }
  if (norm.minutes >= 60) { norm.minutes -= 60; norm.degree += 1 }
  return `${norm.degree}-${p(norm.minutes)}-${p(norm.seconds)}`
}

// -------------------------------------------------------------- quadrant math

/** Convert an angle in a quadrant ('-1'..'-4' or NE/SE/SW/NW) to a north-azimuth angle. */
export function getNorthAzimuthAngle (angle: number, quadrant: string): number {
  const q = quadrant.toUpperCase()
  angle = Number(angle)
  switch (q) {
    case '-1': case 'NE': return (angle + 360) % 360
    case '-2': case 'SE': return (360 + 180 - angle) % 360
    case '-3': case 'SW': return (360 + 180 + angle) % 360
    case '-4': case 'NW': return (360 - angle) % 360
    default: return angle
  }
}

export function getSouthAzimuthFromNorthAzimuth (na: number): number {
  return (na + 180) % 360
}

/** Quadrant info from a north-azimuth decimal degree. */
export function getQuadrantAngleAndShortcut (naDD: number): { angle: number, quadrant: 'NE' | 'SE' | 'SW' | 'NW' } {
  const dd = ((naDD % 360) + 360) % 360
  if (dd >= 0 && dd <= 90) return { angle: dd, quadrant: 'NE' }
  if (dd > 90 && dd <= 180) return { angle: 180 - dd, quadrant: 'SE' }
  if (dd > 180 && dd <= 270) return { angle: dd - 180, quadrant: 'SW' }
  return { angle: 360 - dd, quadrant: 'NW' }
}

// -------------------------------------------------------------- input parsing

interface FormatDef { regex: RegExp, type: 'decimalDegree' | 'degreeMinuteSeconds', toNA: (res: RegExpExecArray, ps: PlanSettings) => number | null }

/** Same nine regexes as WAB utils.getBearingFormatArr, with per-format NA conversion. */
function getBearingFormatArr (): FormatDef[] {
  const arr: FormatDef[] = []
  // (0) dd-mm-ss-[1234]
  arr.push({
    regex: /^((?:-)?(?:3[0-5]\d|[12]\d{2}|[0-9]\d?|0))(?:-(0|[0-5]?\d)-(0|[0-5]\d))?-([1-4])$/,
    type: 'degreeMinuteSeconds',
    toNA: (res) => {
      const dd = DMStoDD({ degree: Number(res[1]), minutes: Number(res[2] ?? 0), seconds: Number(res[3] ?? 0) })
      return getNorthAzimuthAngle(dd, '-' + res[4])
    }
  })
  // (1) [NS]dd-mm-ss[EW]
  arr.push({
    regex: /^([nNsS])((?:-)?(?:3[0-5]\d|[12]\d{2}|[0-9]\d?|0))(?:-(0|[0-5]?\d)-(0|[0-5]\d))?([eEwW])$/,
    type: 'degreeMinuteSeconds',
    toNA: (res) => {
      const dd = DMStoDD({ degree: Number(res[2]), minutes: Number(res[3] ?? 0), seconds: Number(res[4] ?? 0) })
      return getNorthAzimuthAngle(dd, res[1] + res[5])
    }
  })
  // (2) [NS]dd.mmss[EW]
  arr.push({
    regex: /^([nNsS])((?:-)?(?:3[0-5]\d|[12]\d{2}|[0-9]\d?|0))(?:\.([0-5]\d)(?:([0-5]\d))?)?([eEwW])$/,
    type: 'degreeMinuteSeconds',
    toNA: (res) => {
      const dd = DMStoDD({ degree: Number(res[2]), minutes: Number(res[3] ?? 0), seconds: Number(res[4] ?? 0) })
      return getNorthAzimuthAngle(dd, res[1] + res[5])
    }
  })
  // (3) dd.mmss - interpreted per plan settings
  arr.push({
    regex: /^((?:-)?(?:3[0-5]\d|[12]\d{2}|[0-9]\d?|0))(?:\.([0-5]\d)(?:([0-5]\d))?)?$/,
    type: 'degreeMinuteSeconds',
    toNA: (res, ps) => {
      const dd = DMStoDD({ degree: Number(res[1]), minutes: Number(res[2] ?? 0), seconds: Number(res[3] ?? 0) })
      const quadrant = ps.directionOrAngleType === 'southAzimuth' ? '-3' : '-1'
      return getNorthAzimuthAngle(dd, quadrant)
    }
  })
  // (4) dd.dddd - interpreted per plan settings
  arr.push({
    regex: /^((?:(?:-?)(?:3[0-5]\d|[12]\d{2}|[0-9]\d?|0)(?:\.\d+)?)|(?:-?)(?:\.\d+))$/,
    type: 'decimalDegree',
    toNA: (res, ps) => {
      const quadrant = ps.directionOrAngleType === 'southAzimuth' ? '-3' : '-1'
      return getNorthAzimuthAngle(Number(res[1]), quadrant)
    }
  })
  // (5) dd-mm-ss - invalid when plan uses quadrant bearing (matches WAB behavior)
  arr.push({
    regex: /^((?:-)?(?:3[0-5]\d|[12]\d{2}|[0-9]\d?|0))(?:-(0|[0-5]?\d)-((?:[0-5]\d)))?$/,
    type: 'degreeMinuteSeconds',
    toNA: (res, ps) => {
      if (ps.directionOrAngleType === 'quadrantBearing') return null
      const dd = DMStoDD({ degree: Number(res[1]), minutes: Number(res[2] ?? 0), seconds: Number(res[3] ?? 0) })
      const quadrant = ps.directionOrAngleType === 'southAzimuth' ? '-3' : '-1'
      return getNorthAzimuthAngle(dd, quadrant)
    }
  })
  // (6) dd.mmss-[1234]
  arr.push({
    regex: /^((?:-)?(?:3[0-5]\d|[12]\d{2}|[0-9]\d?|0))(?:\.([0-5]\d)(?:([0-5]\d))?)?(-[1-4])$/,
    type: 'degreeMinuteSeconds',
    toNA: (res) => {
      const dd = DMStoDD({ degree: Number(res[1]), minutes: Number(res[2] ?? 0), seconds: Number(res[3] ?? 0) })
      return getNorthAzimuthAngle(dd, res[4])
    }
  })
  // (7) [NS]dd.dddd[EW]
  arr.push({
    regex: /^([nNsS])((?:(?:-?)(?:3[0-5]\d|[12]\d{2}|[0-9]\d?|0)(?:\.\d+)?)|(?:-?)(?:\.\d+))([eEwW])$/,
    type: 'decimalDegree',
    toNA: (res) => getNorthAzimuthAngle(Number(res[2]), res[1] + res[3])
  })
  // (8) dd.dddd-[1234]
  arr.push({
    regex: /^((?:(?:-?)(?:3[0-5]\d|[12]\d{2}|[0-9]\d?|0)(?:\.\d+)?)|(?:-?)(?:\.\d+))(-[1-4])$/,
    type: 'decimalDegree',
    toNA: (res) => getNorthAzimuthAngle(Number(res[1]), res[2])
  })
  return arr
}

/** Build the full conversions object from a north-azimuth decimal degree value. */
export function buildBearingConversions (naDD: number, originalInput: string): BearingConversions {
  naDD = ((naDD % 360) + 360) % 360
  const saDD = getSouthAzimuthFromNorthAzimuth(naDD)
  const qb = getQuadrantAngleAndShortcut(naDD)
  const qbDMS = DDtoDMS(qb.angle)
  return {
    naDD,
    naDDRound: naDD.toFixed(4),
    saDD,
    saDDRound: saDD.toFixed(4),
    naDMS: padDMS(DDtoDMS(naDD)),
    saDMS: padDMS(DDtoDMS(saDD)),
    qb3DD: `${qb.quadrant.charAt(0)}${qb.angle.toFixed(4)}${qb.quadrant.charAt(1)}`,
    qb3DDRound: `${qb.quadrant.charAt(0)}${qb.angle.toFixed(2)}${qb.quadrant.charAt(1)}`,
    qb3DMS: `${qb.quadrant.charAt(0)}${padDMS(qbDMS)}${qb.quadrant.charAt(1)}`,
    originalInput
  }
}

/**
 * Normalize deed-notation bearings to the widget's dash format so descriptions
 * can be pasted directly from record documents (AH 215 conventions):
 *   N45\u00B030'00"E, N. 45\u00B0 30' E., 45\u00B030' -> N45-30-00E / 45-30-00
 * Degree, minute, and second symbols become dashes, spaces and letter periods
 * are removed, and missing seconds are padded with 00.
 */
export function normalizeBearingInput (raw: string): string {
  let s = String(raw).trim()
  if (!/[\u00B0\u00BA\u2032\u2033'".\s]/.test(s)) return s
  s = s.replace(/\s+/g, '')
  s = s.replace(/([NSEWnsew])\./g, '$1')   // N. -> N
  s = s.replace(/[\u00B0\u00BA]/g, '-')    // degree symbols -> dash
  s = s.replace(/[\u2032']/g, '-')          // minute symbols -> dash
  s = s.replace(/[\u2033"]/g, '')           // second symbols removed
  s = s.replace(/-+(?=[EWew]$)/, '')        // trailing dash before quadrant letter
  s = s.replace(/-+$/, '')                  // trailing dash at end
  // pad missing seconds: [N]dd-mm[E] -> [N]dd-mm-00[E]
  const m = /^([NSns])?(\d{1,3})-([0-5]?\d)([EWew])?$/.exec(s)
  if (m) {
    s = `${m[1] ?? ''}${m[2]}-${m[3]}-00${m[4] ?? ''}`
  }
  return s
}

/**
 * Parse an entered bearing string using the plan-settings-preferred formats first,
 * then the rest (same two-pass strategy as WAB). Returns null if invalid.
 */
export function categorizeBearingFormat (bearing: string | number, planSettings: PlanSettings): BearingConversions | null {
  const value = normalizeBearingInput(String(bearing).trim())
  const formats = getBearingFormatArr()

  const tryFormats = (matchType: boolean): BearingConversions | null => {
    for (const fmt of formats) {
      const typeMatches = fmt.type === planSettings.directionOrAngleUnits
      if (typeMatches !== matchType) continue
      const res = fmt.regex.exec(value)
      if (res && res.length > 0) {
        const naDD = fmt.toNA(res, planSettings)
        if (naDD === null || isNaN(naDD)) return null
        return buildBearingConversions(naDD, value)
      }
    }
    return null
  }

  return tryFormats(true) ?? tryFormats(false)
}

/** Display string for a bearing per current plan settings. */
export function getBearingForPlanSettings (b: BearingConversions, ps: PlanSettings): string {
  if (ps.directionOrAngleType === 'northAzimuth') {
    return ps.directionOrAngleUnits === 'decimalDegree' ? b.naDDRound : b.naDMS
  }
  if (ps.directionOrAngleType === 'southAzimuth') {
    return ps.directionOrAngleUnits === 'decimalDegree' ? b.saDDRound : b.saDMS
  }
  return ps.directionOrAngleUnits === 'decimalDegree' ? b.qb3DDRound : b.qb3DMS
}
