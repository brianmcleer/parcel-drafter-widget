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
      pq.spatialRelationship = 'intersects'
      pq.returnGeometry = true
      pq.outFields = ['*']
      const pfs = await polygonLayer.queryFeatures(pq)
      if (pfs.features.length > 0) {
        result.polygonFeature = pfs.features[0]
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
  seedQuery.units = 'meters'
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
      q.units = 'meters'
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
  return result
}
