import { type ImmutableObject } from 'jimu-core'

export interface LineTypeConfig {
  type: number
  isDefault: boolean
  label: string
  symbol: any // autocast esri simple-line symbol json
}

export interface LineFieldMap {
  bearing: string
  distance: string
  radius: string
  arcLength: string
  lineType: string
}

export interface PolygonFieldMap {
  name: string
  description: string
  statedArea: string
  miscloseRatio: string
  miscloseDistance: string
  rotation: string
  scale: string
}

export interface AttributeFieldConfig {
  name: string   // layer field name
  alias: string  // display label override ('' = use layer alias)
}

export interface PolygonAttributeSettings {
  /** 'popup' derives editable fields from the layer's popup template;
   *  'custom' uses the explicitly configured field list;
   *  'legacy' keeps the fixed name/description/stated-area inputs. */
  mode: 'legacy' | 'popup' | 'custom'
  fields: AttributeFieldConfig[]
}

export interface Config {
  startOrRotationSymbol: any
  pointSymbol: any
  lineTypes: LineTypeConfig[]
  boundaryLineType: number
  snappingTolerance: number
  miscloseSnapDistance: number
  miscloseSnapDistanceUnit: 'feet' | 'meters' | 'uSSurveyFeet'
  miscloseRatioSnap: number
  pointLayerDsId: string
  lineLayerDsId: string
  polygonLayerDsId: string
  lineFieldMap: LineFieldMap
  polygonFieldMap: PolygonFieldMap
  polygonAttributes: PolygonAttributeSettings
}

export type IMConfig = ImmutableObject<Config>
