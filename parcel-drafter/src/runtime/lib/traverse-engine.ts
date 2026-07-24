/**
 * Core traverse computation engine - a UI-independent port of the drawing,
 * misclose, and compass-rule logic from WAB ParcelDrafter/NewTraverse.js.
 * Works in WGS84 (4326); callers project to/from the map SR.
 */
import Point from 'esri/geometry/Point'
import Polyline from 'esri/geometry/Polyline'
import Polygon from 'esri/geometry/Polygon'
import * as geo from './geometry-utils'
import { type BearingConversions, categorizeBearingFormat, buildBearingConversions } from './bearing-utils'
import { type LengthConversions } from './unit-utils'

export interface TraverseItem {
  bearing: string
  distance: string
  radius: string
  lineType: number // matches config.lineTypes[].type
  bearingConversions: BearingConversions
  lengthConversions: LengthConversions | null // full (arc) length
  chordLengthConversions: LengthConversions | null // set when radius entered
  radiusConversions: LengthConversions | null
  // computed on draw:
  startPoint?: Point
  endPoint?: Point
  lat?: number
  dep?: number
  adjustedValues?: AdjustedValues
}

export interface AdjustedValues {
  lat: number
  dep: number
  adjustedLength: number
  adjustedBearing: number
  adjustedBearingNADD: number
}

export interface ParcelCloseDetails {
  isClosed: boolean
  compassStartPoint: Point | null
  compassEndPoint: Point | null
  miscloseDistance?: number
  miscloseBearing?: number
}

export interface MiscloseDetails {
  bearingConversions?: BearingConversions
  areaConversions?: geo.AreaConversions
  miscloseRatio: number | string
  miscloseValue: number
  accuracy: boolean
  adjustPoints?: boolean
  compassCompleteLength?: number
  miscloseDistanceMeters: number
}

export interface DrawnLine {
  item: TraverseItem
  geometry: Polyline // 4326
  endPoint: Point // 4326
  isBoundary: boolean
}

export interface DrawResult {
  lines: DrawnLine[]
  points: Point[] // node points (4326), excluding start
  boundaryPaths: number[][][] // paths of boundary lines for ratio/polygon calc
}

export interface ArcInfo {
  endPoint: Point
  arcGeometryPointsArray: Point[]
}

/** Port of NewTraverse.getArcInfo - compute arc end point + densified geometry. */
export function getArcInfo (chordStartPoint: Point, initBearing: number, radiusMeters: number, chordDistanceMeters: number): ArcInfo {
  const absDistance = Math.abs(chordDistanceMeters)
  const chordEndPoint = geo.getDestinationPoint(chordStartPoint, initBearing, absDistance)
  const chordMidPoint = geo.getDestinationPoint(chordStartPoint, initBearing, absDistance / 2)
  const centerAndChordDistance = Math.sqrt(
    Math.abs(radiusMeters * radiusMeters - (absDistance / 2) * (absDistance / 2))
  )
  const arcParam = geo.getArcParam({
    distance: chordDistanceMeters,
    radius: radiusMeters,
    initBearing,
    chordMidPoint,
    chordStartPoint,
    chordEndPoint,
    centerAndChordDistance
  })
  let startAngle = arcParam.startAngle
  let endAngle = arcParam.endAngle
  if (endAngle < startAngle) endAngle += 360
  let arcPoints = geo.getPointsForArc(startAngle, endAngle, arcParam.centerPoint, radiusMeters)
  // ensure the arc runs start -> end in entry direction
  const first = arcPoints[0]
  if (first && geo.getDistanceBetweenPoints(first, chordStartPoint) >
      geo.getDistanceBetweenPoints(first, chordEndPoint)) {
    arcPoints = arcPoints.slice().reverse()
  }
  // pin exact endpoints
  if (arcPoints.length > 1) {
    arcPoints[0] = chordStartPoint
    arcPoints[arcPoints.length - 1] = chordEndPoint
  }
  return { endPoint: chordEndPoint, arcGeometryPointsArray: arcPoints }
}

/**
 * Compute all line geometries from a start point (4326).
 * When adjustPoints is true, compass-rule-adjusted values are used for boundary lines.
 */
export function computeTraverse (
  startPoint: Point, items: TraverseItem[], boundaryLineType: number, adjustPoints: boolean
): DrawResult {
  const lines: DrawnLine[] = []
  const points: Point[] = []
  const boundaryPaths: number[][][] = []
  let startForNext = startPoint

  for (const item of items) {
    const isBoundary = item.lineType === boundaryLineType
    const hasRadius = !(item.radius === '' || item.radius === '0' || Number(item.radius) === 0)
    let bearing: number
    let distance: number
    let geometry: Polyline
    let endPoint: Point

    item.startPoint = startForNext

    if (!hasRadius) {
      if (item.adjustedValues && adjustPoints && isBoundary) {
        bearing = pickAdjustedBearing(item)
        distance = item.adjustedValues.adjustedLength
      } else {
        bearing = item.bearingConversions.naDD
        distance = item.lengthConversions.meters
      }
      endPoint = geo.getDestinationPoint(startForNext, bearing, distance)
      geometry = geo.getLineBetweenPoints([startForNext, endPoint])
    } else {
      let initBearing: number
      if (item.adjustedValues && adjustPoints && isBoundary) {
        initBearing = pickAdjustedBearing(item)
        distance = item.adjustedValues.adjustedLength
        if (item.chordLengthConversions.meters < 0) distance = distance * -1
      } else {
        initBearing = item.bearingConversions.naDD
        distance = item.chordLengthConversions.meters
      }
      const arcInfo = getArcInfo(startForNext, initBearing, item.radiusConversions.meters, distance)
      endPoint = arcInfo.endPoint
      geometry = geo.getLineBetweenPoints(arcInfo.arcGeometryPointsArray)
    }

    item.endPoint = endPoint
    startForNext = endPoint
    points.push(endPoint)
    lines.push({ item, geometry, endPoint, isBoundary })
    if (isBoundary) {
      for (const p of geometry.paths) boundaryPaths.push(p as any)
    }
  }
  return { lines, points, boundaryPaths }
}

function pickAdjustedBearing (item: TraverseItem): number {
  // Match WAB: if quadrant starts with 'S' or latitude negative, use NA-converted value
  const av = item.adjustedValues
  if (item.bearingConversions.qb3DDRound.charAt(0) === 'S' || av.lat < 0) {
    return av.adjustedBearingNADD
  }
  return av.adjustedBearing
}

/** Port of NewTraverse.getParcelCloseDetails. */
export function getParcelCloseDetails (items: TraverseItem[], boundaryLineType: number): ParcelCloseDetails {
  const details: ParcelCloseDetails = { isClosed: false, compassStartPoint: null, compassEndPoint: null }
  let isValid = true
  let boundaryLinesCount = 0
  const pt = { x: 0, y: 0 }
  let compassStartPoint: Point | undefined
  let compassEndPoint: Point | undefined

  items.forEach((item, index) => {
    if (item.lineType === boundaryLineType) {
      const itemLengthInMeters = item.chordLengthConversions
        ? item.chordLengthConversions.meters
        : item.lengthConversions.meters
      if (boundaryLinesCount === 0) {
        compassStartPoint = item.startPoint
      } else {
        compassEndPoint = item.endPoint
      }
      boundaryLinesCount++
      pt.x += Math.cos(item.bearingConversions.naDD / 180 * Math.PI) * itemLengthInMeters
      pt.y += Math.sin(item.bearingConversions.naDD / 180 * Math.PI) * itemLengthInMeters
    } else if (index > 0 && boundaryLinesCount !== 0) {
      isValid = false
    }
  })

  if (boundaryLinesCount > 1 && isValid && compassStartPoint && compassEndPoint) {
    let miscloseDistance = Math.sqrt(pt.x * pt.x + pt.y * pt.y)
    miscloseDistance = geo.removeNegativeExponents(miscloseDistance)
    const sp = new Point({
      x: parseFloat(compassStartPoint.x.toFixed(6)),
      y: parseFloat(compassStartPoint.y.toFixed(6)),
      spatialReference: { wkid: 4326 }
    })
    const ep = new Point({
      x: parseFloat(compassEndPoint.x.toFixed(6)),
      y: parseFloat(compassEndPoint.y.toFixed(6)),
      spatialReference: { wkid: 4326 }
    })
    const miscloseBearing = geo.getAngleBetweenPoints(ep, sp)
    details.isClosed = true
    details.compassStartPoint = sp
    details.compassEndPoint = ep
    details.miscloseDistance = miscloseDistance
    details.miscloseBearing = miscloseBearing
  }
  return details
}

/** Port of NewTraverse._getPolygonAtOrigin - boundary polygon computed at SR origin. */
export function getPolygonAtOrigin (items: TraverseItem[], boundaryLineType: number, adjustPoints: boolean): Polygon | null {
  const startPoint = new Point({ x: 0, y: 0, spatialReference: { wkid: 4326 } })
  const boundaryItems = items.filter(i => i.lineType === boundaryLineType)
  if (boundaryItems.length === 0) return null
  const result = computeTraverse(startPoint, boundaryItems.map(i => ({ ...i })), boundaryLineType, adjustPoints)
  if (result.boundaryPaths.length === 0) return null
  return geo.getPolygonFromPolyLines(result.boundaryPaths, true)
}

/** Port of NewTraverse._getMiscloseRatioInfo. */
export function getMiscloseRatioInfo (miscloseDistance: number, boundaryPaths: number[][][]): {
  miscloseRatio: number | string
  miscloseValue: number
  compassCompleteLength: number
} {
  const lowRatio = 10
  const highRatio = 100000
  let miscloseRatio: number | string = 0
  let miscloseValue = 0
  let compassCompleteLength = 0
  if (boundaryPaths.length > 0) {
    const boundaryPolyLine = geo.getPolyLineFromPaths(boundaryPaths)
    compassCompleteLength = geo.getLengthOfGeometry(boundaryPolyLine)
    if (compassCompleteLength > 0) {
      const ratio = 1 / (miscloseDistance / compassCompleteLength)
      if (ratio < lowRatio) {
        miscloseRatio = 0
      } else if (ratio < highRatio) {
        miscloseValue = Math.trunc(ratio)
        miscloseRatio = '1:' + Math.trunc(ratio)
      } else {
        miscloseRatio = ratio
      }
    }
  }
  return { miscloseRatio, miscloseValue, compassCompleteLength }
}

/** Port of NewTraverse.getCalculatedMiscloseDetails (data portion). */
export function getCalculatedMiscloseDetails (
  parcelCloseDetails: ParcelCloseDetails,
  items: TraverseItem[],
  boundaryLineType: number,
  adjustPoints: boolean,
  boundaryPaths: number[][][],
  miscloseSnapDistanceMeters: number,
  miscloseRatioSnap: number
): MiscloseDetails | null {
  if (!parcelCloseDetails.compassStartPoint || !parcelCloseDetails.compassEndPoint) return null
  const highRatio = 100000
  let miscloseBearing = parcelCloseDetails.miscloseBearing ?? 0
  const miscloseDistance = parcelCloseDetails.miscloseDistance ?? 0
  if (miscloseDistance === 0) miscloseBearing = 0

  const details: MiscloseDetails = {
    miscloseRatio: 0,
    miscloseValue: 0,
    accuracy: false,
    miscloseDistanceMeters: miscloseDistance
  }
  details.bearingConversions = buildBearingConversions(miscloseBearing, String(miscloseBearing))

  const polygon = getPolygonAtOrigin(items, boundaryLineType, adjustPoints)
  if (polygon) details.areaConversions = geo.getAreaOfGeometry(polygon)

  const ratioInfo = getMiscloseRatioInfo(miscloseDistance, boundaryPaths)
  details.miscloseRatio = ratioInfo.miscloseRatio
  details.miscloseValue = ratioInfo.miscloseValue
  const numericRatio = typeof ratioInfo.miscloseRatio === 'number'
    ? ratioInfo.miscloseRatio
    : ratioInfo.miscloseValue
  if (numericRatio >= highRatio) details.accuracy = true

  if ((miscloseDistance > 0 && miscloseDistance <= miscloseSnapDistanceMeters) ||
      (isFinite(numericRatio) && numericRatio >= miscloseRatioSnap)) {
    details.adjustPoints = true
    details.compassCompleteLength = ratioInfo.compassCompleteLength
  }
  return details
}

/** Port of NewTraverse._applyCompassRule - mutates items with adjustedValues, returns whether closure achieved. */
export function applyCompassRule (items: TraverseItem[], boundaryLineType: number, compassCompleteLength: number): boolean {
  let sumOfLat = 0
  let sumOfDep = 0

  for (const values of items) {
    if (values.lineType === boundaryLineType) {
      let length = values.chordLengthConversions
        ? values.chordLengthConversions.meters
        : values.lengthConversions.meters
      if (!(values.radius === '' || values.radius === '0' || Number(values.radius) === 0) && values.chordLengthConversions) {
        length = values.chordLengthConversions.meters
      }
      length = Math.abs(length)
      values.lat = length * Math.cos(values.bearingConversions.naDD * (Math.PI / 180))
      values.dep = length * Math.sin(values.bearingConversions.naDD * (Math.PI / 180))
      sumOfLat += values.lat
      sumOfDep += values.dep
    }
  }

  const info = { sumOfLat, sumOfDep, sumOfAllLinesLength: compassCompleteLength }
  for (const values of items) {
    if (values.lineType !== boundaryLineType) continue
    let length: number
    if (values.radius === '' || values.radius === '0' || Number(values.radius) === 0) {
      length = values.lengthConversions.meters
    } else {
      length = values.chordLengthConversions.meters
    }
    length = Math.abs(length)
    values.adjustedValues = adjustBearingAndDistance(values.lat, values.dep, length, info)
  }

  // closure check on adjusted values
  let sumOfAdjustedLat = 0
  let sumOfAdjustedDep = 0
  for (const values of items) {
    if (values.lineType === boundaryLineType && values.adjustedValues) {
      sumOfAdjustedLat += parseFloat(values.adjustedValues.lat.toFixed(2))
      sumOfAdjustedDep += parseFloat(values.adjustedValues.dep.toFixed(2))
      sumOfAdjustedLat = parseFloat(sumOfAdjustedLat.toFixed(2))
      sumOfAdjustedDep = parseFloat(sumOfAdjustedDep.toFixed(2))
    }
  }
  return Math.trunc(sumOfAdjustedLat) === 0 && Math.trunc(sumOfAdjustedDep) === 0
}

/** Port of NewTraverse._adjustBearingAndDistance. */
function adjustBearingAndDistance (
  lat: number, dep: number, lineLength: number,
  info: { sumOfLat: number, sumOfDep: number, sumOfAllLinesLength: number }
): AdjustedValues {
  lat = parseFloat(lat.toFixed(6))
  dep = parseFloat(dep.toFixed(6))
  lineLength = parseFloat(lineLength.toFixed(6))

  let latCorrection = ((-info.sumOfLat) / info.sumOfAllLinesLength) * lineLength
  let depCorrection = ((-info.sumOfDep) / info.sumOfAllLinesLength) * lineLength
  latCorrection = parseFloat(latCorrection.toFixed(6))
  depCorrection = parseFloat(depCorrection.toFixed(6))

  let adjustedLat = parseFloat((lat + latCorrection).toFixed(6))
  let adjustedDep = parseFloat((dep + depCorrection).toFixed(6))

  const adjustedLength = Math.sqrt(adjustedLat ** 2 + adjustedDep ** 2)
  let adjustedBearing = Math.atan(adjustedDep / adjustedLat)
  adjustedBearing = parseFloat(adjustedBearing.toFixed(6))
  const adjustedBearingDeg = adjustedBearing * (180 / Math.PI)

  // as in WAB: compute the NA-converted value treating the raw atan result as south azimuth
  const conversions = categorizeBearingFormat(String(adjustedBearingDeg), {
    directionOrAngleType: 'southAzimuth',
    directionOrAngleUnits: 'decimalDegree',
    distanceAndLengthUnits: 'meters',
    areaUnits: 'squareMeters',
    circularCurveParameters: 'radiusAndChordLength'
  })

  return {
    lat: adjustedLat,
    dep: adjustedDep,
    adjustedLength,
    adjustedBearing: adjustedBearingDeg,
    adjustedBearingNADD: conversions ? conversions.naDD : adjustedBearingDeg
  }
}
