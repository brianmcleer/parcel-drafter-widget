/**
 * Save the drawn traverse to the configured point / line / polygon feature layers.
 * Port of the applyEdits workflow in WAB ParcelDrafter/PlanInfo.js, on JS API 4.x.
 */
import Graphic from 'esri/Graphic'
import Point from 'esri/geometry/Point'
import { type DrawnLine } from './traverse-engine'
import { type LineFieldMap, type PolygonFieldMap } from '../../config'
import * as geo from './geometry-utils'
import { getPolygonFromPolyLines } from './geometry-utils'

export interface PlanInfoValues {
  name: string
  description: string
  statedArea: string
  miscloseRatio: string | number
  miscloseDistance: number
  rotation: number
  scale: number
  /** Additional polygon attribute values from the configured attribute settings
   *  (popup/custom modes); keys are layer field names. */
  attributeValues?: { [fieldName: string]: any }
}

/** Present when saving an Edit Traverse session: the save becomes an update -
 *  the polygon feature is updated in place and its previous lines are replaced. */
export interface EditSession {
  polygonObjectId: number | null
  lineObjectIds: number[]
}

export interface SaveLayers {
  pointLayer?: __esri.FeatureLayer
  lineLayer?: __esri.FeatureLayer
  polygonLayer?: __esri.FeatureLayer
}

function setIfFieldExists (layer: __esri.FeatureLayer, attributes: any, fieldName: string, value: any): void {
  if (!fieldName) return
  const exists = layer.fields?.some(f => f.name.toLowerCase() === fieldName.toLowerCase())
  if (exists) {
    const actual = layer.fields.find(f => f.name.toLowerCase() === fieldName.toLowerCase())
    attributes[actual.name] = value
  }
}

/**
 * Persist the traverse. Geometries arrive in 4326 and are projected to each
 * layer's spatial reference before applyEdits.
 */
export async function saveTraverse (
  layers: SaveLayers,
  lines: DrawnLine[],
  nodePoints: Point[],
  startPoint: Point,
  planInfo: PlanInfoValues,
  lineFieldMap: LineFieldMap,
  polygonFieldMap: PolygonFieldMap,
  boundaryLineType: number,
  editSession?: EditSession | null
): Promise<{ pointCount: number, lineCount: number, polygonAdded: boolean }> {
  const result = { pointCount: 0, lineCount: 0, polygonAdded: false }

  // ---- lines ----
  if (layers.lineLayer) {
    const outSR = layers.lineLayer.spatialReference
    const adds: Graphic[] = []
    for (const line of lines) {
      const projected = await geo.getProjectedGeometry(line.geometry, outSR)
      const attributes: any = {}
      const item = line.item
      setIfFieldExists(layers.lineLayer, attributes, lineFieldMap.bearing, item.bearingConversions.naDD)
      setIfFieldExists(layers.lineLayer, attributes, lineFieldMap.distance,
        item.lengthConversions ? item.lengthConversions.meters : null)
      setIfFieldExists(layers.lineLayer, attributes, lineFieldMap.radius,
        item.radiusConversions ? item.radiusConversions.meters : null)
      setIfFieldExists(layers.lineLayer, attributes, lineFieldMap.arcLength,
        item.radiusConversions && item.lengthConversions ? item.lengthConversions.meters : null)
      setIfFieldExists(layers.lineLayer, attributes, lineFieldMap.lineType, item.lineType)
      adds.push(new Graphic({ geometry: projected, attributes }))
    }
    if (adds.length > 0) {
      const edits: any = { addFeatures: adds }
      if (editSession?.lineObjectIds?.length) {
        // Edit Traverse: replace the parcel's previous lines instead of duplicating
        edits.deleteFeatures = editSession.lineObjectIds.map(objectId => ({ objectId }))
      }
      const editsResult = await layers.lineLayer.applyEdits(edits)
      result.lineCount = editsResult.addFeatureResults?.filter(r => !r.error).length ?? 0
    }
  }

  // ---- points (start point + node points) ----
  // Edit sessions skip point re-creation: existing node points are left untouched
  // to avoid duplicates (original points are not tracked by object id).
  if (layers.pointLayer && !editSession) {
    const outSR = layers.pointLayer.spatialReference
    const adds: Graphic[] = []
    const allPoints = [startPoint, ...nodePoints]
    for (const pt of allPoints) {
      const projected = await geo.getProjectedGeometry(pt, outSR)
      adds.push(new Graphic({ geometry: projected, attributes: {} }))
    }
    if (adds.length > 0) {
      const editsResult = await layers.pointLayer.applyEdits({ addFeatures: adds })
      result.pointCount = editsResult.addFeatureResults?.filter(r => !r.error).length ?? 0
    }
  }

  // ---- polygon (closed boundary) ----
  if (layers.polygonLayer) {
    const boundaryPaths: number[][][] = []
    for (const line of lines) {
      if (line.isBoundary) {
        for (const p of line.geometry.paths) boundaryPaths.push(p as any)
      }
    }
    if (boundaryPaths.length > 0) {
      const polygon4326 = getPolygonFromPolyLines(boundaryPaths, false, true)
      const outSR = layers.polygonLayer.spatialReference
      const projected = await geo.getProjectedGeometry(polygon4326, outSR)
      const attributes: any = {}
      setIfFieldExists(layers.polygonLayer, attributes, polygonFieldMap.name, planInfo.name)
      setIfFieldExists(layers.polygonLayer, attributes, polygonFieldMap.description, planInfo.description)
      setIfFieldExists(layers.polygonLayer, attributes, polygonFieldMap.statedArea, planInfo.statedArea)
      setIfFieldExists(layers.polygonLayer, attributes, polygonFieldMap.miscloseRatio, String(planInfo.miscloseRatio))
      setIfFieldExists(layers.polygonLayer, attributes, polygonFieldMap.miscloseDistance, planInfo.miscloseDistance)
      setIfFieldExists(layers.polygonLayer, attributes, polygonFieldMap.rotation, planInfo.rotation)
      setIfFieldExists(layers.polygonLayer, attributes, polygonFieldMap.scale, planInfo.scale)
      // configured attribute settings (popup / custom field modes)
      if (planInfo.attributeValues) {
        for (const fieldName of Object.keys(planInfo.attributeValues)) {
          setIfFieldExists(layers.polygonLayer, attributes, fieldName, planInfo.attributeValues[fieldName])
        }
      }
      if (editSession?.polygonObjectId != null) {
        // Edit Traverse: update the existing parcel polygon in place
        attributes[layers.polygonLayer.objectIdField] = editSession.polygonObjectId
        const editsResult = await layers.polygonLayer.applyEdits({
          updateFeatures: [new Graphic({ geometry: projected, attributes })]
        })
        result.polygonAdded = (editsResult.updateFeatureResults?.filter(r => !r.error).length ?? 0) > 0
      } else {
        const editsResult = await layers.polygonLayer.applyEdits({
          addFeatures: [new Graphic({ geometry: projected, attributes })]
        })
        result.polygonAdded = (editsResult.addFeatureResults?.filter(r => !r.error).length ?? 0) > 0
      }
    }
  }

  return result
}
