/**
 * Case-insensitive field name handling.
 *
 * The same data can reach the widget with different field casing: a hosted
 * feature layer published to Portal or ArcGIS Online often lowercases field
 * names (Direction becomes direction), while the same data served as a map
 * service keeps the original case. The widget therefore never compares a
 * configured field name to a layer field name directly. Every read and every
 * write resolves the configured name against the layer's real field list first,
 * so a configuration made against one service keeps working against the other.
 */

/** The layer's real field name matching `configured`, ignoring case. Null when
 *  the field is not on the layer (or nothing is configured). */
export function resolveFieldName (layer: __esri.FeatureLayer, configured: string): string | null {
  if (!configured || !layer) return null
  const fields: any[] = (layer.fields ?? []) as any[]
  const target = configured.toLowerCase()
  const match = fields.find((f: any) => String(f?.name ?? '').toLowerCase() === target)
  return match ? match.name : null
}

/** Read an attribute by configured name, ignoring case. Works off the feature's
 *  own attribute keys, so it does not need the layer's field list. */
export function readAttribute (attributes: any, configured: string): any {
  if (!attributes || !configured) return undefined
  if (attributes[configured] !== undefined) return attributes[configured]
  const target = configured.toLowerCase()
  const key = Object.keys(attributes).find(k => k.toLowerCase() === target)
  return key != null ? attributes[key] : undefined
}

/** Configured field names that do not exist on the layer under any casing.
 *  Blank entries are not configured and are never reported. */
export function getMissingFields (layer: __esri.FeatureLayer | null, configured: string[]): string[] {
  if (!layer) return []
  const fields: any[] = (layer.fields ?? []) as any[]
  if (fields.length === 0) return [] // field list not loaded: cannot judge
  const present = new Set(fields.map((f: any) => String(f?.name ?? '').toLowerCase()))
  const missing: string[] = []
  for (const name of configured) {
    if (!name) continue
    if (!present.has(name.toLowerCase()) && !missing.includes(name)) missing.push(name)
  }
  return missing
}
