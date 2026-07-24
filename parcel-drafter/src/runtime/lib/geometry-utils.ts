/**
 * Port of WAB ParcelDrafter/geometryUtils.js to the ArcGIS Maps SDK for JavaScript 4.x.
 * Vincenty direct/inverse solutions (c) Chris Veness 2002-2016, MIT Licence.
 * Original widget code Copyright Esri, Apache 2.0.
 *
 * Geometry services (projection, simplify, geodesic length/area) are loaded at
 * runtime through jimu-arcgis, preferring the modern operator modules
 * (esri/geometry/operators/*, SDK 4.31+) and falling back to the classic
 * projection/geometryEngine modules on older SDKs. This keeps the widget
 * working across ExB versions and supports any organization spatial reference.
 */
import Point from 'esri/geometry/Point'
import Polyline from 'esri/geometry/Polyline'
import Polygon from 'esri/geometry/Polygon'
import SpatialReference from 'esri/geometry/SpatialReference'
import { loadArcGISJSAPIModules } from 'jimu-arcgis'

/** Anything with x/y in WGS84 decimal degrees (esri Point or plain object). */
export type PointLike = Point | { x: number, y: number }

const xy = (p: PointLike): { x: number, y: number } => p as unknown as { x: number, y: number }

export interface InverseResult {
  distance: number
  initialBearing: number
  finalBearing: number
}

const WGS84 = new SpatialReference({ wkid: 4326 })

// ------------------------------------------------------------------ geometry ops
// Runtime-resolved geometry services with operator-first / classic-fallback loading.
interface GeometryOps {
  project: (geometry: any, outSR: any) => any
  simplify: (geometry: any) => any
  geodesicLengthMeters: (geometry: any) => number
  geodesicAreaSquareMeters: (polygon: any) => number
}

let geometryOps: GeometryOps = null
let geometryOpsPromise: Promise<GeometryOps> = null

async function loadGeometryOps (): Promise<GeometryOps> {
  // Modern operators (Maps SDK 4.31+; classic modules removed in newer SDKs)
  try {
    const [projectOperator, simplifyOperator, lengthOperator, areaOperator] =
      await loadArcGISJSAPIModules([
        'esri/geometry/operators/projectOperator',
        'esri/geometry/operators/simplifyOperator',
        'esri/geometry/operators/geodeticLengthOperator',
        'esri/geometry/operators/geodeticAreaOperator'
      ])
    await Promise.all([
      projectOperator.load?.(),
      simplifyOperator.load?.(),
      lengthOperator.load?.(),
      areaOperator.load?.()
    ].filter(Boolean))
    return {
      project: (geometry, outSR) => projectOperator.execute(geometry, outSR),
      simplify: (geometry) => simplifyOperator.execute(geometry),
      geodesicLengthMeters: (geometry) => lengthOperator.execute(geometry, { unit: 'meters' }),
      geodesicAreaSquareMeters: (polygon) => areaOperator.execute(polygon, { unit: 'square-meters' })
    }
  } catch (e) { /* fall through to classic modules */ }

  // Classic modules (SDK <= ~4.32 / older ExB versions)
  const [projection, geometryEngine] = await loadArcGISJSAPIModules([
    'esri/geometry/projection',
    'esri/geometry/geometryEngine'
  ])
  await projection.load?.()
  return {
    project: (geometry, outSR) => projection.project(geometry, outSR),
    simplify: (geometry) => geometryEngine.simplify(geometry),
    geodesicLengthMeters: (geometry) => geometryEngine.geodesicLength(geometry, 'meters'),
    geodesicAreaSquareMeters: (polygon) => geometryEngine.geodesicArea(polygon, 'square-meters')
  }
}

/** Load (once) the geometry services. Await this before sync length/area calls. */
export function ensureGeometryOps (): Promise<GeometryOps> {
  if (!geometryOpsPromise) {
    geometryOpsPromise = loadGeometryOps().then(ops => { geometryOps = ops; return ops })
  }
  return geometryOpsPromise
}

/** Preload geometry/projection services when the map is ready so orgs on any
 *  spatial reference (State Plane, national grids, ...) get instant projection. */
export function preloadProjectionEngine (): void {
  ensureGeometryOps().catch(err => console.error('ParcelDrafter: geometry services failed to load', err))
}

/** Project a geometry to outSR (no-op when SRs match). Works for any org SR. */
export async function getProjectedGeometry<T = any> (geometry: any, outSR: any): Promise<T> {
  const inSR = geometry?.spatialReference
  if (inSR && outSR && (inSR.wkid === outSR.wkid || inSR === outSR)) {
    return geometry as T
  }
  const ops = await ensureGeometryOps()
  const result = ops.project(geometry, outSR)
  return (result && typeof result.then === 'function' ? await result : result) as T
}

/** Vincenty direct: destination point (4326) from start point (4326), bearing (deg), distance (m). */
export function getDestinationPoint (startPoint: PointLike, initialBearing: number, distance: number): Point | null {
  const sp = xy(startPoint)
  const a = 6378137
  const b = 6356752.314245
  const f = (a - b) / a

  const phi1 = sp.y * Math.PI / 180
  const lambda1 = sp.x * Math.PI / 180
  const alpha1 = initialBearing * Math.PI / 180
  const s = distance

  const sinAlpha1 = Math.sin(alpha1)
  const cosAlpha1 = Math.cos(alpha1)

  const tanU1 = (1 - f) * Math.tan(phi1)
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1)
  const sinU1 = tanU1 * cosU1
  const sigma1 = Math.atan2(tanU1, cosAlpha1)
  const sinAlpha = cosU1 * sinAlpha1
  const cosSqAlpha = 1 - sinAlpha * sinAlpha
  const uSq = cosSqAlpha * (a * a - b * b) / (b * b)
  const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
  const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))

  let cos2SigmaM: number, sinSigma: number, cosSigma: number, deltaSigma: number
  let sigma = s / (b * A)
  let sigmaP: number
  let iterations = 0
  do {
    cos2SigmaM = Math.cos(2 * sigma1 + sigma)
    sinSigma = Math.sin(sigma)
    cosSigma = Math.cos(sigma)
    deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
      B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)))
    sigmaP = sigma
    sigma = s / (b * A) + deltaSigma
  } while (Math.abs(sigma - sigmaP) > 1e-12 && ++iterations < 200)
  if (iterations >= 200) return null

  const x = sinU1 * sinSigma - cosU1 * cosSigma * cosAlpha1
  const phi2 = Math.atan2(sinU1 * cosSigma + cosU1 * sinSigma * cosAlpha1,
    (1 - f) * Math.sqrt(sinAlpha * sinAlpha + x * x))
  const lambda = Math.atan2(sinSigma * sinAlpha1, cosU1 * cosSigma - sinU1 * sinSigma * cosAlpha1)
  const C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha))
  const L = lambda - (1 - C) * f * sinAlpha *
    (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)))
  const lambda2 = (lambda1 + L + 3 * Math.PI) % (2 * Math.PI) - Math.PI // normalise to -180..+180

  return new Point({
    x: lambda2 * 180 / Math.PI,
    y: phi2 * 180 / Math.PI,
    spatialReference: WGS84
  })
}

/** Vincenty inverse: distance (m, 1mm precision) + initial/final bearings between two 4326 points. */
export function getInverseCalculations (startPoint: PointLike, endPoint: PointLike): InverseResult | null {
  const sp = xy(startPoint)
  const ep = xy(endPoint)
  const phi1 = sp.y * Math.PI / 180
  const lambda1 = sp.x * Math.PI / 180
  const phi2 = ep.y * Math.PI / 180
  const lambda2 = ep.x * Math.PI / 180

  const a = 6378137
  const b = 6356752.314245
  const f = (a - b) / a

  const L = lambda2 - lambda1
  const tanU1 = (1 - f) * Math.tan(phi1)
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1)
  const sinU1 = tanU1 * cosU1
  const tanU2 = (1 - f) * Math.tan(phi2)
  const cosU2 = 1 / Math.sqrt(1 + tanU2 * tanU2)
  const sinU2 = tanU2 * cosU2

  let sinLambda: number, cosLambda: number, sinSqSigma: number, sinSigma = 0, cosSigma = 0,
    sigma = 0, sinAlpha: number, cosSqAlpha = 0, cos2SigmaM = 0, C: number

  let lambda = L
  let lambdaP: number
  let iterations = 0
  do {
    sinLambda = Math.sin(lambda)
    cosLambda = Math.cos(lambda)
    sinSqSigma = (cosU2 * sinLambda) * (cosU2 * sinLambda) +
      (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda) * (cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
    sinSigma = Math.sqrt(sinSqSigma)
    if (sinSigma === 0) {
      return { distance: 0, initialBearing: 0, finalBearing: 0 } // co-incident points
    }
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLambda
    sigma = Math.atan2(sinSigma, cosSigma)
    sinAlpha = cosU1 * cosU2 * sinLambda / sinSigma
    cosSqAlpha = 1 - sinAlpha * sinAlpha
    cos2SigmaM = cosSigma - 2 * sinU1 * sinU2 / cosSqAlpha
    if (isNaN(cos2SigmaM)) cos2SigmaM = 0 // equatorial line
    C = f / 16 * cosSqAlpha * (4 + f * (4 - 3 * cosSqAlpha))
    lambdaP = lambda
    lambda = L + (1 - C) * f * sinAlpha *
      (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)))
  } while (Math.abs(lambda - lambdaP) > 1e-12 && ++iterations < 200)
  if (iterations >= 200) return null

  const uSq = cosSqAlpha * (a * a - b * b) / (b * b)
  const A = 1 + uSq / 16384 * (4096 + uSq * (-768 + uSq * (320 - 175 * uSq)))
  const B = uSq / 1024 * (256 + uSq * (-128 + uSq * (74 - 47 * uSq)))
  const deltaSigma = B * sinSigma * (cos2SigmaM + B / 4 * (cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
    B / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)))

  let s = b * A * (sigma - deltaSigma)

  let alpha1 = Math.atan2(cosU2 * sinLambda, cosU1 * sinU2 - sinU1 * cosU2 * cosLambda)
  let alpha2 = Math.atan2(cosU1 * sinLambda, -sinU1 * cosU2 + cosU1 * sinU2 * cosLambda)
  alpha1 = (alpha1 + 2 * Math.PI) % (2 * Math.PI)
  alpha2 = (alpha2 + 2 * Math.PI) % (2 * Math.PI)

  s = Number(s.toFixed(3))
  return {
    distance: s,
    initialBearing: alpha1 * 180 / Math.PI,
    finalBearing: alpha2 * 180 / Math.PI
  }
}

export function getLineBetweenPoints (pointsArray: PointLike[]): Polyline | null {
  const pathsArray: number[][] = []
  pointsArray.forEach(point => {
    const p = xy(point)
    pathsArray.push([removeNegativeExponents(p.x), removeNegativeExponents(p.y)])
  })
  if (pathsArray.length > 0) {
    return new Polyline({ paths: [pathsArray], spatialReference: { wkid: 4326 } })
  }
  return null
}

export function getAngleBetweenPoints (originPoint: PointLike, chordPoint: PointLike): number {
  const inverseInfo = getInverseCalculations(originPoint, chordPoint)
  return inverseInfo === null ? 0 : inverseInfo.initialBearing
}

export function getDistanceBetweenPoints (startPoint: PointLike, endPoint: PointLike): number {
  const inverseInfo = getInverseCalculations(startPoint, endPoint)
  return inverseInfo === null ? 0 : inverseInfo.distance
}

export function getLengthOfGeometry (geometry: any): number {
  if (!geometryOps) return 0 // ops preloaded on map ready; redraw recomputes
  const simplified = geometryOps.simplify(geometry)
  return simplified ? geometryOps.geodesicLengthMeters(simplified) : 0
}

export interface AreaConversions {
  acres: number
  squareMeters: number
  squareFeet: number
  squareUSSurveyFeet: number
}

export function getAreaOfGeometry (geometry: any): AreaConversions {
  const empty = { acres: 0, squareMeters: 0, squareFeet: 0, squareUSSurveyFeet: 0 }
  if (!geometryOps) return empty
  const simplified = geometryOps.simplify(geometry)
  if (!simplified) return empty
  const sqm = geometryOps.geodesicAreaSquareMeters(simplified)
  // derive other units from square meters (same constants as WAB utils.js)
  const ftPerM = 3.28083333333 // US survey feet per meter
  return {
    squareMeters: sqm,
    acres: sqm / 4046.8564224,
    squareFeet: sqm * 10.763910416709722,
    squareUSSurveyFeet: sqm * ftPerM * ftPerM
  }
}

export function getPolyLineFromPaths (pathsArray: number[][][]): Polyline {
  return new Polyline({ paths: pathsArray as any, spatialReference: { wkid: 4326 } })
}

export function getPolygonFromPolyLines (
  pathsArray: number[][][], addLastPoint: boolean, updateLastPoint?: boolean,
  spatialReference?: SpatialReference
): Polygon {
  const ring: number[][] = []
  const polygon = new Polygon({ spatialReference: spatialReference ?? { wkid: 4326 } })
  for (let i = 0; i < pathsArray.length; i++) {
    for (let j = 0; j < pathsArray[i].length; j++) {
      ring.push(pathsArray[i][j])
    }
  }
  if (ring.length === 0) return polygon
  if (addLastPoint) {
    ring.push([...ring[0]])
  } else if (updateLastPoint) {
    ring[ring.length - 1][0] = ring[0][0]
    ring[ring.length - 1][1] = ring[0][1]
  }
  if (!polygon.isClockwise(ring as any)) {
    ring.reverse()
  }
  polygon.addRing(ring as any)
  return polygon
}

/** Densified point array of an arc from start/end angle around a center point (4326). */
export function getPointsForArc (startAngle: number, endAngle: number, centerPoint: Point, radius: number): Point[] {
  const pointArray: Point[] = []
  const angleOfArc = endAngle - startAngle
  let segments = Math.trunc(angleOfArc)
  if (segments <= 0) segments = 1
  const unitAngle = Math.abs(angleOfArc) / Math.abs(segments)
  if (unitAngle > 0) {
    for (let i = 0; i < Math.abs(segments) + 1; i++) {
      const bearingForEachPoint = startAngle + unitAngle * i
      const point = getDestinationPoint(centerPoint, bearingForEachPoint, Math.abs(radius))
      if (point) pointArray.push(point)
    }
  }
  return pointArray
}

export interface ArcParamInput {
  distance: number
  radius: number
  initBearing: number
  chordMidPoint: Point
  chordStartPoint: Point
  chordEndPoint: Point
  centerAndChordDistance: number
}

export interface ArcParamResult {
  bearing: number
  centerPoint: Point
  startAngle: number
  endAngle: number
}

/** Arc parameters (center, start/end angles) - direct port incl. major/minor arc & chord side cases. */
export function getArcParam (param: ArcParamInput): ArcParamResult {
  const r: Partial<ArcParamResult> = {}
  if (param.distance < 0) { // major arc
    if (param.radius < 0) { // left side of chord
      r.bearing = param.initBearing + 90
      r.centerPoint = getDestinationPoint(param.chordMidPoint, r.bearing, param.centerAndChordDistance)
      r.startAngle = getAngleBetweenPoints(r.centerPoint, param.chordEndPoint)
      r.endAngle = getAngleBetweenPoints(r.centerPoint, param.chordStartPoint)
    } else { // right side of chord
      r.bearing = param.initBearing - 90
      r.centerPoint = getDestinationPoint(param.chordMidPoint, r.bearing, param.centerAndChordDistance)
      r.startAngle = getAngleBetweenPoints(r.centerPoint, param.chordStartPoint)
      r.endAngle = getAngleBetweenPoints(r.centerPoint, param.chordEndPoint)
    }
  } else { // minor arc
    if (param.radius > 0) { // right side of chord
      r.bearing = param.initBearing + 90
      r.centerPoint = getDestinationPoint(param.chordMidPoint, r.bearing, param.centerAndChordDistance)
      r.startAngle = getAngleBetweenPoints(r.centerPoint, param.chordStartPoint)
      r.endAngle = getAngleBetweenPoints(r.centerPoint, param.chordEndPoint)
    } else { // left side of chord
      r.bearing = param.initBearing - 90
      r.centerPoint = getDestinationPoint(param.chordMidPoint, r.bearing, param.centerAndChordDistance)
      r.startAngle = getAngleBetweenPoints(r.centerPoint, param.chordEndPoint)
      r.endAngle = getAngleBetweenPoints(r.centerPoint, param.chordStartPoint)
    }
  }
  return r as ArcParamResult
}

export function removeNegativeExponents (num: number): number {
  return num.toString().toLowerCase().split('e-').length > 1 ? 0 : num
}

export function getChordLengthFromArcLength (arcLength: number, radius: number): number {
  arcLength = Math.abs(arcLength)
  const arcLengthOfSemiCircle = Math.PI * Math.abs(radius)
  const theta = arcLength / Math.abs(radius)
  let chordLength = Math.abs(radius) * Math.sin(theta / 2)
  chordLength = arcLength <= arcLengthOfSemiCircle ? chordLength * 2 : chordLength * -2
  return chordLength
}

export function getArcLengthFromChordLength (chordLength: number, radius: number): number {
  const absChordLength = Math.abs(chordLength)
  radius = Math.abs(radius)
  let arcLength = 2 * Math.asin(absChordLength / (2 * radius)) * radius
  if (chordLength < 0) {
    arcLength = 2 * Math.PI * radius - arcLength
  }
  return arcLength
}

export function chordBearingToTangentBearing (chordBearing: number, radius: number, chordLength: number): number {
  const radToChordAngle = Math.acos((Math.abs(chordLength) / 2) / Math.abs(radius)) * (180 / Math.PI)
  const minorArc = radius / Math.abs(radius)
  const leftOfChord = chordLength / Math.abs(chordLength)
  let tanBearing = chordBearing + minorArc * 90 - minorArc * leftOfChord * radToChordAngle
  tanBearing = tanBearing < 0 ? tanBearing + 360 : (tanBearing >= 360 ? tanBearing % 360 : tanBearing)
  return removeNegativeExponents(tanBearing)
}

export function tangentBearingToChordBearing (tanBearing: number, radius: number, chordLength: number): number {
  const radToChordAngle = Math.acos((Math.abs(chordLength) / 2) / Math.abs(radius)) * (180 / Math.PI)
  const minorArc = radius / Math.abs(radius)
  const leftOfChord = chordLength / Math.abs(chordLength)
  let chordBearing = tanBearing + minorArc * 90 - minorArc * leftOfChord * radToChordAngle
  chordBearing = chordBearing < 0 ? chordBearing + 360 : (chordBearing >= 360 ? chordBearing % 360 : chordBearing)
  return removeNegativeExponents(chordBearing)
}

/** Rotation angle between two points (planar, screen-style) - used by the rotate tool. */
export function getRotationAngleBetweenPoints (originPoint: PointLike, chordPoint: PointLike): number {
  const op = xy(originPoint)
  const cp = xy(chordPoint)
  const dx = cp.x - op.x
  const dy = cp.y - op.y
  let angle = Math.atan2(dx, dy) * 180 / Math.PI
  angle = (angle + 360) % 360
  return angle
}
