/**
 * Edit-traverse helpers: select a parcel's full line set (closed via its polygon,
 * or unclosed via a connectivity walk from the clicked line) and order the lines
 * end-to-start so the traverse grid reflects the original entry sequence.
 * Replaces the WAB initEditing connectivity behavior on JS API 4.x.
 */
import Point from 'esri/geometry/Point'

export interface ChainedFeature {
  feature: __esri.Graphic
  start: Point
  end: Point
}

function firstVertex (geom: __esri.Polyline): Point {
  return geom.getPoint(0, 0)
}

function lastVertex (geom: __esri.Polyline): Point {
  const pathIndex = geom.paths.length - 1
  const ptIndex = geom.paths[pathIndex].length - 1
  return geom.getPoint(pathIndex, ptIndex)
}

function samePoint (a: Point, b: Point, tol: number): boolean {
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol
}

/** Order line features into a connected chain (end -> next start). Handles closed
 *  loops (starts anywhere) and open chains (starts at the free end). Unconnected
 *  leftovers are appended in query order so nothing is silently dropped. */
export function chainLineFeatures (features: __esri.Graphic[], tolerance: number): __esri.Graphic[] {
  const nodes: ChainedFeature[] = features
    .filter(f => f.geometry?.type === 'polyline')
    .map(f => ({
      feature: f,
      start: firstVertex(f.geometry as __esri.Polyline),
      end: lastVertex(f.geometry as __esri.Polyline)
    }))
  if (nodes.length <= 1) return nodes.map(n => n.feature)

  // find a chain head: a feature whose start is not any other feature's end
  let head = nodes.find(n =>
    !nodes.some(other => other !== n && samePoint(other.end, n.start, tolerance)))
  if (!head) head = nodes[0] // closed loop - start anywhere

  const ordered: ChainedFeature[] = []
  const remaining = new Set(nodes)
  let current: ChainedFeature | undefined = head
  while (current) {
    ordered.push(current)
    remaining.delete(current)
    const tail: Point = current.end
    current = undefined
    for (const candidate of remaining) {
      if (samePoint(candidate.start, tail, tolerance)) {
        current = candidate
        break
      }
    }
  }
  // append any disconnected leftovers rather than dropping them
  for (const leftover of remaining) ordered.push(leftover)
  return ordered.map(n => n.feature)
}

export interface ParcelSelection {
  lineFeatures: __esri.Graphic[]
  polygonFeature: __esri.Graphic | null
}

/**
 * Select the full set of parcel lines at a clicked location.
 * Closed parcel: the polygon at the click provides the footprint; all lines
 * intersecting it are selected. Unclosed parcel: starting from the clicked
 * line(s), repeatedly query for lines touching the current set's endpoints
 * (the doc's "click any of its lines to select the unclosed boundaries").
 */
export async function selectParcelAtPoint (
  clickedMapPoint: __esri.Point,
  toleranceMapUnits: number,
  lineLayer: __esri.FeatureLayer,
  polygonLayer: __esri.FeatureLayer | null
): Promise<ParcelSelection> {
  const result: ParcelSelection = { lineFeatures: [], polygonFeature: null }

  // 1) closed parcel via polygon layer
  if (polygonLayer) {
    try {
      const pq = polygonLayer.createQuery()
      pq.geometry = clickedMapPoint
      // The user clicks a boundary line, so the click lands ON the polygon edge
      // rather than inside it, and services disagree about whether a point exactly
      // on an edge intersects the polygon: hosted feature layers commonly say no
      // where a map service says yes. Buffering the click by the same tolerance the
      // line queries use makes the hit consistent across both. Without it the
      // polygon is not found, the edit session has no polygon to update, and saving
      // stacks a second polygon on top of the original.
      pq.distance = toleranceMapUnits
      pq.spatialRelationship = 'intersects'
      pq.returnGeometry = true
      pq.outFields = ['*']
      const pfs = await polygonLayer.queryFeatures(pq)
      if (pfs.features.length > 0) {
        result.polygonFeature = pickNearestFeature(pfs.features, clickedMapPoint)
        const lq = lineLayer.createQuery()
        lq.geometry = result.polygonFeature.geometry
        lq.spatialRelationship = 'intersects'
        lq.returnGeometry = true
        lq.outFields = ['*']
        const lfs = await lineLayer.queryFeatures(lq)
        result.lineFeatures = chainLineFeatures(lfs.features, toleranceMapUnits)
        if (result.lineFeatures.length > 0) return result
      }
    } catch (e) {
      console.warn('ParcelDrafter: polygon selection failed, falling back to line walk', e)
    }
  }

  // 2) unclosed parcel: seed from the clicked line, walk connectivity
  const seedQuery = lineLayer.createQuery()
  seedQuery.geometry = clickedMapPoint
  seedQuery.distance = toleranceMapUnits
  seedQuery.spatialRelationship = 'intersects'
  seedQuery.returnGeometry = true
  seedQuery.outFields = ['*']
  const seed = await lineLayer.queryFeatures(seedQuery)
  if (seed.features.length === 0) return result

  const oidField = lineLayer.objectIdField
  const collected = new Map<number, __esri.Graphic>()
  seed.features.forEach(f => collected.set(f.attributes[oidField], f))

  // iterative endpoint expansion (bounded)
  for (let i = 0; i < 25; i++) {
    const endpoints: Point[] = []
    collected.forEach(f => {
      const geom = f.geometry as __esri.Polyline
      endpoints.push(firstVertex(geom), lastVertex(geom))
    })
    let grew = false
    for (const ep of endpoints) {
      const q = lineLayer.createQuery()
      q.geometry = ep
      q.distance = toleranceMapUnits
      q.spatialRelationship = 'intersects'
      q.returnGeometry = true
      q.outFields = ['*']
      const fs = await lineLayer.queryFeatures(q)
      for (const f of fs.features) {
        const oid = f.attributes[oidField]
        if (!collected.has(oid)) {
          collected.set(oid, f)
          grew = true
        }
      }
    }
    if (!grew) break
  }

  result.lineFeatures = chainLineFeatures(Array.from(collected.values()), toleranceMapUnits)

  // 3) the click did not land on a polygon but the lines did come back. Look the
  //    polygon up again from inside the boundary they form, so an edit session
  //    still updates the existing parcel instead of adding a second one over it.
  if (!result.polygonFeature && polygonLayer && result.lineFeatures.length > 0) {
    result.polygonFeature = await findPolygonInsideLines(result.lineFeatures, polygonLayer)
  }

  return result
}

/** The feature whose extent center is closest to `point`. A buffered click can
 *  return the neighbor parcel as well as the one the user meant. */
function pickNearestFeature (features: __esri.Graphic[], point: __esri.Point): __esri.Graphic {
  if (features.length === 1) return features[0]
  let best = features[0]
  let bestDist = Infinity
  for (const f of features) {
    const ext: any = (f.geometry as any)?.extent
    if (!ext) continue
    const cx = (ext.xmin + ext.xmax) / 2
    const cy = (ext.ymin + ext.ymax) / 2
    const d = (cx - point.x) ** 2 + (cy - point.y) ** 2
    if (d < bestDist) { bestDist = d; best = f }
  }
  return best
}

/** Find the parcel polygon that the selected lines enclose, by querying with a
 *  point inside the boundary rather than on it. The center of the lines' combined
 *  extent is inside for any ordinary parcel shape, and being off the edge avoids
 *  the boundary-intersection disagreement between hosted layers and map services. */
async function findPolygonInsideLines (
  lineFeatures: __esri.Graphic[],
  polygonLayer: __esri.FeatureLayer
): Promise<__esri.Graphic | null> {
  let xmin = Infinity
  let ymin = Infinity
  let xmax = -Infinity
  let ymax = -Infinity
  let sr: any = null
  for (const f of lineFeatures) {
    const geom: any = f.geometry
    if (!geom?.paths) continue
    sr = sr ?? geom.spatialReference
    for (const path of geom.paths) {
      for (const v of path) {
        if (v[0] < xmin) xmin = v[0]
        if (v[0] > xmax) xmax = v[0]
        if (v[1] < ymin) ymin = v[1]
        if (v[1] > ymax) ymax = v[1]
      }
    }
  }
  if (!sr || xmin === Infinity) return null

  const center = new Point({ x: (xmin + xmax) / 2, y: (ymin + ymax) / 2, spatialReference: sr })
  try {
    const q = polygonLayer.createQuery()
    q.geometry = center
    q.spatialRelationship = 'intersects'
    q.returnGeometry = true
    q.outFields = ['*']
    const fs = await polygonLayer.queryFeatures(q)
    if (fs.features.length === 0) return null
    return pickNearestFeature(fs.features, center)
  } catch (e) {
    console.warn('ParcelDrafter: polygon lookup from the selected lines failed', e)
    return null
  }
}
