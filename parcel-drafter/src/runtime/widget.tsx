/**
 * Parcel Drafter - ArcGIS Experience Builder widget.
 * React/TypeScript port of the WAB ParcelDrafter Widget.js + NewTraverse.js orchestration.
 */
/** @jsx jsx */
import { React, jsx, css, type AllWidgetProps, DataSourceManager } from 'jimu-core'
import { JimuMapViewComponent, type JimuMapView, loadArcGISJSAPIModules } from 'jimu-arcgis'
import { Button, TextInput, Label, Loading, Tooltip, Select, Option } from 'jimu-ui'
import { ColorPicker } from 'jimu-ui/basic/color-picker'
import GraphicsLayer from 'esri/layers/GraphicsLayer'
import Graphic from 'esri/Graphic'
import Point from 'esri/geometry/Point'
import SpatialReference from 'esri/geometry/SpatialReference'

const WGS84 = new SpatialReference({ wkid: 4326 })
import * as symbolJsonUtils from 'esri/symbols/support/jsonUtils'

import { type IMConfig, type LineTypeConfig } from '../config'
import defaultMessages from './translations/default'
import * as geo from './lib/geometry-utils'
import * as engine from './lib/traverse-engine'
import { type TraverseItem, type MiscloseDetails } from './lib/traverse-engine'
import { type PlanSettings, categorizeBearingFormat, buildBearingConversions, getBearingForPlanSettings } from './lib/bearing-utils'
import {
    categorizeLengthFormat, feetToMeters, usSurveyFeetToMeters, metersToFeet, metersToUSSurveyFeet, type LengthConversions
} from './lib/unit-utils'
import { getChordLengthFromArcLength } from './lib/geometry-utils'
import { TraverseGrid } from './components/traverse-grid'
import { InfoNote } from './components/ui-helpers'
import { PlanSettingsPanel } from './components/plan-settings'
import { MiscloseDetailsPanel } from './components/misclose-details'
import { ParcelTools } from './components/parcel-tools'
import { saveTraverse, type EditSession } from './lib/save-utils'
import { selectParcelAtPoint } from './lib/edit-utils'
import { readAttribute, getMissingFields } from './lib/field-utils'
import { CalciteIcon } from 'calcite-components'
import HelpPopup from './components/HelpPopup'
import FirstRunHint from './components/FirstRunHint'
import { buildHelpSections, type HelpFeatures } from './helpSections'

type Page = 'home' | 'traverse'
type MapClickMode = 'none' | 'startPoint' | 'digitize' | 'rotationPoint' | 'editSelect'

const widgetStyle = css`
  overflow: auto;
  height: 100%;
  padding: 10px;
  .pd-section-title { font-weight: 700; font-size: 14px; margin: 8px 0 6px 0; }
  :focus-visible {
    outline: 2px solid var(--sys-color-primary-main, #076fe5);
    outline-offset: 1px;
  }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  .pd-toolbar { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
  .pd-hint { font-size: 12px; color: var(--sys-color-surface-paper-text, #6a6a6a); margin-bottom: 8px; }
  .pd-plan-info input { margin-bottom: 6px; }
  .pd-message {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 12px;
    line-height: 1.4;
    margin-top: 8px;
    padding: 8px;
    border-radius: 2px;
  }
  .pd-message.error {
    color: var(--sys-color-error-text, var(--sys-color-error-main));
    background: var(--sys-color-error-light, transparent);
    border-left: 3px solid var(--sys-color-error-main);
  }
  .pd-message.success {
    color: var(--sys-color-success-text, var(--sys-color-success-main));
    background: var(--sys-color-success-light, transparent);
    border-left: 3px solid var(--sys-color-success-main);
  }
`

interface AttributeFieldRuntime {
    name: string
    alias: string
    type: string // esri field type
}

interface State {
    page: Page
    mapClickMode: MapClickMode
    dragMode: 'none' | 'rotate' | 'scale'
    showLabels: boolean
    snappingEnabled: boolean
    traverseColor: string
    editSession: EditSession | null
    attributeFields: AttributeFieldRuntime[]
    planAttrs: { [fieldName: string]: any }
    items: TraverseItem[]
    startPointSet: boolean
    planSettings: PlanSettings
    showPlanSettings: boolean
    misclose: MiscloseDetails | null
    rotation: number
    scale: number
    planName: string
    planDescription: string
    statedArea: string
    message: { text: string, type: 'error' | 'success' } | null
    saving: boolean
    /** Line type applied to newly digitized map clicks and the grid entry row
     *  (WAB parity: choose Boundary Line vs Connection Line while drawing). */
    currentLineType: number
    helpOpen: boolean
    showFirstRunHint: boolean
}

export default class Widget extends React.PureComponent<AllWidgetProps<IMConfig>, State> {
    // Type-only declarations (no emitted code): keep the checker happy even when the
    // IDE cannot resolve React's class typings through jimu-core.
    declare props: AllWidgetProps<IMConfig> & { id: string, useMapWidgetIds?: any }
    declare state: State
    // Loose on purpose: must stay assignable to both the real React 19 setState
    // (webpack build) and the mode B shim's PureComponent.setState (VS check).
    declare setState: (partial: any, callback?: () => void) => void

    jimuMapView: JimuMapView = null
    clickHandle: __esri.Handle = null
    linesLayer: GraphicsLayer = null
    pointsLayer: GraphicsLayer = null
    labelsLayer: GraphicsLayer = null
    snapScratchLayer: GraphicsLayer = null
    snapSVM: any = null
    TextSymbolClass: any = null
    SketchViewModelClass: any = null
    CollectionClass: any = null
    svmModulesLoading = false
    startPoint4326: Point = null // in WGS84
    rotationPointIndex: number = -1 // -1 => start point is the rotation anchor
    lastDrawResult: engine.DrawResult = null
    adjustPoints = false

    constructor(props) {
        super(props)
        this.state = {
            page: 'home',
            mapClickMode: 'none',
            dragMode: 'none',
            showLabels: true,
            snappingEnabled: true,
            traverseColor: '',
            editSession: null,
            attributeFields: [],
            planAttrs: {},
            items: [],
            startPointSet: false,
            planSettings: {
                directionOrAngleType: 'quadrantBearing',
                directionOrAngleUnits: 'degreeMinuteSeconds',
                distanceAndLengthUnits: 'feet',
                areaUnits: 'acres',
                circularCurveParameters: 'radiusAndChordLength'
            },
            showPlanSettings: false,
            misclose: null,
            rotation: 0,
            scale: 1,
            planName: '',
            planDescription: '',
            statedArea: '',
            message: null,
            saving: false,
            currentLineType: this.getDefaultLineTypeCode(props.config),
            helpOpen: false,
            showFirstRunHint: !this.readHintDismissed(props.id)
        }
    }

    // ------------------------------------------------------------ help guide

    /** Dismissal is per browser and namespaced by widget id so two copies of the
     *  widget in one app do not share it. try/catch: private browsing throws. */
    hintStorageKey (id: string): string {
        return `parcelDrafter.helpHintDismissed.${id}`
    }

    readHintDismissed (id: string): boolean {
        try { return window.localStorage.getItem(this.hintStorageKey(id)) === 'true' } catch (e) { return false }
    }

    dismissFirstRunHint = (): void => {
        try { window.localStorage.setItem(this.hintStorageKey(this.props.id), 'true') } catch (e) { /* not worth breaking the widget over */ }
        this.setState({ showFirstRunHint: false })
    }

    /** Opening the guide counts as answering the hint. */
    openHelp = (): void => {
        if (this.state.showFirstRunHint) this.dismissFirstRunHint()
        this.setState({ helpOpen: true })
    }

    /** Feature flags for the help guide, computed from the same config checks the
     *  save path uses, so the guide never describes a layer this app cannot save to. */
    helpFeatures (): HelpFeatures {
        const config = this.props.config
        return {
            pointLayer: !!config.pointLayerDsId,
            lineLayer: !!config.lineLayerDsId,
            polygonLayer: !!config.polygonLayerDsId
        }
    }

    /** Default line type code from config (the entry marked isDefault, falling back
     *  to the configured boundary type so saves can always build the polygon). */
    getDefaultLineTypeCode(config?: IMConfig): number {
        const cfg = config ?? this.props.config
        const lineTypes: LineTypeConfig[] = (cfg.lineTypes as any).asMutable
            ? (cfg.lineTypes as any).asMutable({ deep: true })
            : cfg.lineTypes as any
        return lineTypes.find(lt => lt.isDefault)?.type ?? cfg.boundaryLineType ?? lineTypes[0]?.type ?? 0
    }

    nls = (id: string): string => {
        return this.props.intl.formatMessage({ id, defaultMessage: (defaultMessages as any)[id] })
    }

    // ------------------------------------------------------------ map wiring

    onActiveViewChange = (jimuMapView: JimuMapView): void => {
        this.removeMapArtifacts()
        this.jimuMapView = jimuMapView
        if (jimuMapView?.view) {
            geo.preloadProjectionEngine() // support any org spatial reference without first-use lag
            this.linesLayer = new GraphicsLayer({ listMode: 'hide' })
            this.pointsLayer = new GraphicsLayer({ listMode: 'hide' })
            this.labelsLayer = new GraphicsLayer({ listMode: 'hide' })
            this.snapScratchLayer = new GraphicsLayer({ listMode: 'hide' })
            jimuMapView.view.map.addMany([this.linesLayer, this.labelsLayer, this.pointsLayer, this.snapScratchLayer])
            this.clickHandle = jimuMapView.view.on('click', this.onMapClick)
            this.dragHandle = jimuMapView.view.on('drag', this.onMapDrag)
            void this.initSnapSVM()
        }
    }

    /** SketchViewModel-based point picking with native snapping to all visible
     *  feature layers (pattern from the Polk County traverse widget). Falls back
     *  to the raw click handler + configured-layer query snapping if unavailable. */
    async initSnapSVM(): Promise<void> {
        if (this.snapSVM || this.svmModulesLoading) return
        this.svmModulesLoading = true
        try {
            if (!this.SketchViewModelClass) {
                const mods = await loadArcGISJSAPIModules([
                    'esri/widgets/Sketch/SketchViewModel',
                    'esri/core/Collection',
                    'esri/symbols/TextSymbol'
                ])
                this.SketchViewModelClass = mods[0]
                this.CollectionClass = mods[1]
                this.TextSymbolClass = mods[2]
            }
            const view = this.jimuMapView?.view
            if (!view || !this.snapScratchLayer) return
            this.snapSVM = new this.SketchViewModelClass({
                view,
                layer: this.snapScratchLayer,
                snappingOptions: {
                    enabled: this.state.snappingEnabled,
                    featureEnabled: true,
                    selfEnabled: false,
                    distance: this.props.config.snappingTolerance ?? 15,
                    featureSources: new this.CollectionClass()
                }
            })
            this.snapSVM.on('create', (event: any) => { void this.onSvmCreate(event) })
            this.syncMapMode() // arm if a pick mode is already active
        } catch (e) {
            console.warn('ParcelDrafter: SketchViewModel snapping unavailable, using click fallback', e)
            this.snapSVM = null
        } finally {
            this.svmModulesLoading = false
        }
    }

    /** Snap targets: every visible feature layer on the map. */
    applySnapSources(): void {
        const view = this.jimuMapView?.view
        if (!view || !this.snapSVM) return
        const sources: any[] = []
        view.map.allLayers.forEach((layer: any) => {
            if (layer?.visible && String(layer.type ?? '').toLowerCase() === 'feature') {
                sources.push({ layer, enabled: true })
            }
        })
        const fs = this.snapSVM.snappingOptions.featureSources
        if (fs?.removeAll) { fs.removeAll(); fs.addMany(sources) } else {
            this.snapSVM.snappingOptions.featureSources = new this.CollectionClass(sources)
        }
    }

    /** Popup suppression while a map tool is active (ExB 1.21 click-open API;
     *  view.popupEnabled no longer exists). Restored when the tool deactivates. */
    syncPopup(suppress: boolean): void {
        const jmv = this.jimuMapView
        if (!jmv) return
        try {
            if (suppress) {
                ; (jmv as any).disableClickOpenPopup?.()
                    ; (jmv as any).closePopup?.()
            } else {
                ; (jmv as any).enableClickOpenPopup?.()
            }
        } catch (e) { /* older ExB versions lack these methods */ }
    }

    /** Central sync for map interaction state: SVM arming, cursor, popup suppression. */
    syncMapMode(): void {
        const view = this.jimuMapView?.view as any
        const mode = this.state.mapClickMode
        const pointPickModes = ['startPoint', 'digitize', 'rotationPoint']
        // cancel any in-flight SVM create before re-arming
        if (this.snapSVM && this.snapSVM.state === 'active') {
            try { this.snapSVM.cancel() } catch (e) { /* ignore */ }
        }
        this.snapScratchLayer?.removeAll()
        if (mode === 'none') {
            if (view) view.cursor = 'auto'
            this.syncPopup(false)
            return
        }
        if (view) view.cursor = 'crosshair'
        this.syncPopup(true)
        if (this.snapSVM && pointPickModes.includes(mode)) {
            this.applySnapSources()
            this.snapSVM.snappingOptions.enabled = this.state.snappingEnabled
            try { this.snapSVM.create('point') } catch (e) { /* fall back to click */ }
        }
    }

    /** SVM point-create handler: routes the snapped point to the active mode. */
    async onSvmCreate(event: any): Promise<void> {
        if (event.state === 'cancel') {
            this.snapScratchLayer?.removeAll()
            return
        }
        if (event.state !== 'complete') return
        const pt = event.graphic?.geometry
        this.snapScratchLayer?.removeAll()
        if (!pt) return
        const mode = this.state.mapClickMode
        const clicked4326 = await geo.getProjectedGeometry(pt, WGS84) as Point
        if (mode === 'startPoint') {
            this.startPoint4326 = clicked4326
            this.setState({ startPointSet: true, mapClickMode: 'digitize' }, () => { void this.redraw(true) })
        } else if (mode === 'digitize') {
            this.addDigitizedLine(clicked4326)
            // re-arm for the next vertex (stay in digitize)
            if (this.state.mapClickMode === 'digitize' && this.snapSVM) {
                this.applySnapSources()
                try { this.snapSVM.create('point') } catch (e) { /* ignore */ }
            }
        } else if (mode === 'rotationPoint') {
            this.setRotationPointFromClick(clicked4326)
        }
    }

    dragHandle: __esri.Handle = null
    dragStart: { angle: number, dist: number, baseRotation: number, baseScale: number, anchor: { x: number, y: number } } = null
    dragRedrawBusy = false

    /** Interactive drag-to-rotate / drag-to-scale around the rotation anchor.
     *  Works in any spatial reference (angles/distances computed in map coords). */
    onMapDrag = (evt: any): void => {
        if (this.state.dragMode === 'none' || !this.state.startPointSet) return
        evt.stopPropagation() // suppress map pan while the tool is active
        const view = this.jimuMapView?.view
        if (!view) return
        const mapPt = view.toMap({ x: evt.x, y: evt.y })
        if (!mapPt) return

        if (evt.action === 'start') {
            void (async () => {
                const anchor4326 = this.rotationAnchor4326 ?? this.effectiveStart4326 ?? this.startPoint4326
                if (!anchor4326) return
                const anchorMap = await geo.getProjectedGeometry(anchor4326, view.spatialReference) as Point
                const dx = mapPt.x - anchorMap.x
                const dy = mapPt.y - anchorMap.y
                this.dragStart = {
                    anchor: { x: anchorMap.x, y: anchorMap.y },
                    angle: Math.atan2(dx, dy) * 180 / Math.PI,
                    dist: Math.sqrt(dx * dx + dy * dy),
                    baseRotation: this.state.rotation,
                    baseScale: this.state.scale
                }
            })()
            return
        }
        if (!this.dragStart) return

        const dx = mapPt.x - this.dragStart.anchor.x
        const dy = mapPt.y - this.dragStart.anchor.y
        if (this.state.dragMode === 'rotate') {
            const angle = Math.atan2(dx, dy) * 180 / Math.PI
            const rotation = (((this.dragStart.baseRotation + angle - this.dragStart.angle) % 360) + 360) % 360
            this.setState({ rotation }, () => { this.scheduleDragRedraw() })
        } else {
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (this.dragStart.dist > 0 && dist > 0) {
                const scale = Math.max(0.0001, this.dragStart.baseScale * (dist / this.dragStart.dist))
                this.setState({ scale }, () => { this.scheduleDragRedraw() })
            }
        }
        if (evt.action === 'end') this.dragStart = null
    }

    scheduleDragRedraw(): void {
        if (this.dragRedrawBusy) return
        this.dragRedrawBusy = true
        void this.redraw().finally(() => { this.dragRedrawBusy = false })
    }

    removeMapArtifacts(): void {
        this.clickHandle?.remove()
        this.clickHandle = null
        this.dragHandle?.remove()
        this.dragHandle = null
        if (this.snapSVM) {
            try { this.snapSVM.destroy() } catch (e) { /* ignore */ }
            this.snapSVM = null
        }
        this.syncPopup(false) // never leave popups suppressed
        if (this.jimuMapView?.view) {
            if (this.linesLayer) this.jimuMapView.view.map.remove(this.linesLayer)
            if (this.pointsLayer) this.jimuMapView.view.map.remove(this.pointsLayer)
            if (this.labelsLayer) this.jimuMapView.view.map.remove(this.labelsLayer)
            if (this.snapScratchLayer) this.jimuMapView.view.map.remove(this.snapScratchLayer)
        }
        this.linesLayer = null
        this.pointsLayer = null
        this.labelsLayer = null
        this.snapScratchLayer = null
    }

    componentWillUnmount(): void {
        this.removeMapArtifacts()
    }

    onMapClick = async (evt: __esri.ViewClickEvent): Promise<void> => {
        const mode = this.state.mapClickMode
        if (mode === 'none') return
        // startPoint/digitize/rotationPoint are handled by the snapping SketchViewModel
        // when available; this click path is the fallback for environments without it.
        if (this.snapSVM && mode !== 'editSelect') return
        const clicked4326 = await geo.getProjectedGeometry(evt.mapPoint, WGS84) as Point
        if (mode === 'startPoint') {
            const snapped = await this.snapToConfiguredLayers(evt.mapPoint)
            this.startPoint4326 = snapped ?? clicked4326
            this.setState({ startPointSet: true, mapClickMode: 'digitize' }, () => { void this.redraw(true) })
        } else if (mode === 'digitize') {
            const snapped = await this.snapToConfiguredLayers(evt.mapPoint)
            this.addDigitizedLine(snapped ?? clicked4326)
        } else if (mode === 'rotationPoint') {
            this.setRotationPointFromClick(clicked4326)
        } else if (mode === 'editSelect') {
            void this.loadTraverseFromLines(evt.mapPoint)
        }
    }

    /** Snap a clicked map point to the nearest point feature or line vertex from the
     *  configured layers within the snapping tolerance (doc: "The starting point can
     *  snap to points or vertices for the layers configured"). Returns 4326 or null. */
    async snapToConfiguredLayers(clickedMapPoint: Point): Promise<Point | null> {
        const view = this.jimuMapView?.view
        if (!view) return null
        const tolerance = (this.props.config.snappingTolerance ?? 15) * view.resolution
        let best: { x: number, y: number } = null
        let bestDist = Infinity

        const consider = (x: number, y: number): void => {
            const d = Math.sqrt((x - clickedMapPoint.x) ** 2 + (y - clickedMapPoint.y) ** 2)
            if (d <= tolerance && d < bestDist) {
                bestDist = d
                best = { x, y }
            }
        }

        const queryLayer = async (dsId: string, vertexMode: boolean): Promise<void> => {
            const layer = await this.resolveLayer(dsId)
            if (!layer) return
            try {
                const q = layer.createQuery()
                q.geometry = clickedMapPoint
                q.distance = tolerance
                q.units = 'meters'
                q.spatialRelationship = 'intersects'
                q.returnGeometry = true
                q.outSpatialReference = view.spatialReference
                const fs = await layer.queryFeatures(q)
                for (const f of fs.features) {
                    const g: any = f.geometry
                    if (!g) continue
                    if (!vertexMode && g.type === 'point') {
                        consider(g.x, g.y)
                    } else if (vertexMode && g.type === 'polyline') {
                        for (const path of g.paths) {
                            for (const v of path) consider(v[0], v[1])
                        }
                    }
                }
            } catch (e) { /* snapping is best-effort */ }
        }

        await Promise.all([
            queryLayer(this.props.config.pointLayerDsId, false),
            queryLayer(this.props.config.lineLayerDsId, true)
        ])
        if (!best) return null
        const snappedMapPoint = new Point({ x: best.x, y: best.y, spatialReference: view.spatialReference })
        return await geo.getProjectedGeometry(snappedMapPoint, WGS84) as Point
    }

    // ---------------------------------------------------- item CRUD + validate

    buildItem = (bearing: string, distance: string, radius: string, lineType: number,
        bearingNaDDOverride?: number): TraverseItem | string => {
        const ps = this.state.planSettings
        const bearingConversions = bearingNaDDOverride !== undefined
            ? buildBearingConversions(bearingNaDDOverride, bearing)
            : categorizeBearingFormat(bearing, ps)
        if (!bearingConversions) return this.nls('invalidBearing')

        const hasRadius = radius !== '' && radius !== '0' && Number(radius) !== 0
        let radiusConversions: LengthConversions | null = null
        let lengthConversions = categorizeLengthFormat(distance, ps.distanceAndLengthUnits)
        if (!lengthConversions) return this.nls('invalidLength')
        let chordLengthConversions: LengthConversions | null = null

        if (hasRadius) {
            radiusConversions = categorizeLengthFormat(radius, ps.distanceAndLengthUnits)
            if (!radiusConversions) return this.nls('invalidRadius')
            // arc cannot be longer than a full circle / chord not longer than diameter
            if (ps.circularCurveParameters === 'radiusAndArcLength') {
                const chordMeters = getChordLengthFromArcLength(lengthConversions.meters, radiusConversions.meters)
                if (isNaN(chordMeters)) return this.nls('invalidRadius')
                chordLengthConversions = categorizeLengthFormat(String(chordMeters), 'meters')
            } else {
                if (Math.abs(lengthConversions.meters) > Math.abs(radiusConversions.meters) * 2) {
                    return this.nls('invalidLengthRadiusProportion')
                }
                chordLengthConversions = lengthConversions
                // for chord entry, the stored "length" is the chord; arc length derives when saving
            }
            if (Math.abs(chordLengthConversions.meters) > Math.abs(radiusConversions.meters) * 2) {
                return this.nls('invalidLengthRadiusProportion')
            }
        }

        return {
            bearing,
            distance,
            radius,
            lineType,
            bearingConversions,
            lengthConversions,
            chordLengthConversions,
            radiusConversions
        }
    }

    onAddItem = (bearing: string, distance: string, radius: string, lineType: number,
        bearingNaDDOverride?: number): string | null => {
        if (!this.state.startPointSet) return this.nls('noStartPoint')
        let bearingText = bearing
        if (bearingNaDDOverride !== undefined) {
            // '*tb' tangent shortcut: store a plan-settings-formatted bearing so the row
            // remains editable and re-parses under the current plan settings
            const conv = buildBearingConversions(bearingNaDDOverride, bearing)
            bearingText = getBearingForPlanSettings(conv, this.state.planSettings)
        }
        const item = this.buildItem(bearingText, distance, radius, lineType, bearingNaDDOverride)
        if (typeof item === 'string') return item
        this.setState({ items: [...this.state.items, item] }, () => { void this.redraw() })
        return null
    }

    onReorder = (from: number, to: number): void => {
        const items = this.state.items.slice()
        const [moved] = items.splice(from, 1)
        items.splice(to, 0, moved)
        if (this.rotationPointIndex === from) this.rotationPointIndex = to
        else if (this.rotationPointIndex >= 0) {
            if (from < this.rotationPointIndex && to >= this.rotationPointIndex) this.rotationPointIndex--
            else if (from > this.rotationPointIndex && to <= this.rotationPointIndex) this.rotationPointIndex++
        }
        this.setState({ items }, () => { void this.redraw() })
    }

    onUpdateItem = (index: number, field: 'bearing' | 'distance' | 'radius', value: string): string | null => {
        const items = this.state.items.slice()
        const current = items[index]
        const next = {
            bearing: field === 'bearing' ? value : current.bearing,
            distance: field === 'distance' ? value : current.distance,
            radius: field === 'radius' ? value : current.radius
        }
        const rebuilt = this.buildItem(next.bearing, next.distance, next.radius, current.lineType)
        if (typeof rebuilt === 'string') {
            // keep the raw text so the user can finish typing; don't redraw
            items[index] = { ...current, [field]: value }
            this.setState({ items })
            return rebuilt
        }
        items[index] = rebuilt
        this.setState({ items }, () => { void this.redraw() })
        return null
    }

    onChangeLineType = (index: number, lineType: number): void => {
        const items = this.state.items.slice()
        items[index] = { ...items[index], lineType }
        this.setState({ items }, () => { void this.redraw() })
    }

    onDeleteItem = (index: number): void => {
        const items = this.state.items.slice()
        items.splice(index, 1)
        if (this.rotationPointIndex >= items.length) this.rotationPointIndex = -1
        this.setState({ items }, () => { void this.redraw() })
    }

    addDigitizedLine(clicked4326: Point): void {
        const lastEnd = this.lastDrawResult?.points.length
            ? this.lastDrawResult.points[this.lastDrawResult.points.length - 1]
            : this.startPoint4326
        if (!lastEnd) return
        const inverse = geo.getInverseCalculations(lastEnd, clicked4326)
        if (!inverse || inverse.distance === 0) return
        // undo current rotation/scale so the stored values redraw to the clicked location
        const naDD = (((inverse.initialBearing - this.state.rotation) % 360) + 360) % 360
        const meters = inverse.distance / (this.state.scale || 1)
        const ps = this.state.planSettings
        const distConv = categorizeLengthFormat(String(meters), 'meters')
        const distText = ps.distanceAndLengthUnits === 'meters'
            ? distConv.metersRound
            : ps.distanceAndLengthUnits === 'feet' ? distConv.feetRound : distConv.uSSurveyFeetRound
        const err = this.onAddItem(naDD.toFixed(4), distText, '', this.state.currentLineType)
        if (err) this.setState({ message: { text: err, type: 'error' } })
    }

    // ------------------------------------------------------------ redraw

    getLineTypes(): LineTypeConfig[] {
        return (this.props.config.lineTypes as any).asMutable
            ? (this.props.config.lineTypes as any).asMutable({ deep: true })
            : this.props.config.lineTypes as any
    }

    /** Clone items applying current rotation and scale (drawing-time transform only). */
    getTransformedItems(): TraverseItem[] {
        const { rotation, scale } = this.state
        return this.state.items.map(item => {
            const clone: TraverseItem = { ...item }
            if (rotation !== 0) {
                const rotated = (((item.bearingConversions.naDD + rotation) % 360) + 360) % 360
                clone.bearingConversions = buildBearingConversions(rotated, item.bearingConversions.originalInput)
            }
            if (scale !== 1) {
                const scaleConv = (c: LengthConversions | null): LengthConversions | null => {
                    if (!c) return c
                    return categorizeLengthFormat(String(c.meters * scale), 'meters')
                }
                clone.lengthConversions = scaleConv(item.lengthConversions)
                clone.chordLengthConversions = scaleConv(item.chordLengthConversions)
                clone.radiusConversions = scaleConv(item.radiusConversions)
            }
            if (item.adjustedValues) {
                clone.adjustedValues = {
                    ...item.adjustedValues,
                    adjustedBearing: item.adjustedValues.adjustedBearing + rotation,
                    adjustedBearingNADD: (((item.adjustedValues.adjustedBearingNADD + rotation) % 360) + 360) % 360,
                    adjustedLength: item.adjustedValues.adjustedLength * scale
                }
            }
            return clone
        })
    }

    async redraw(forceZoom = false): Promise<void> {
        if (!this.jimuMapView?.view || !this.startPoint4326) return
        await geo.ensureGeometryOps() // geometry services ready before misclose length/area math
        const config = this.props.config
        const boundaryLineType = config.boundaryLineType

        // 1. misclose on the raw (untransformed) items
        const rawItems = this.state.items
        // recompute per-item start/end in raw space for close detection
        engine.computeTraverse(this.startPoint4326, rawItems, boundaryLineType, false)
        const closeDetails = engine.getParcelCloseDetails(rawItems, boundaryLineType)
        let misclose: MiscloseDetails | null = null
        this.adjustPoints = false
        if (closeDetails.isClosed) {
            const rawResult = engine.computeTraverse(this.startPoint4326, rawItems, boundaryLineType, false)
            const snapDistanceMeters = this.getMiscloseSnapDistanceMeters()
            misclose = engine.getCalculatedMiscloseDetails(
                closeDetails, rawItems, boundaryLineType, false, rawResult.boundaryPaths,
                snapDistanceMeters, config.miscloseRatioSnap
            )
            if (misclose?.adjustPoints && misclose.compassCompleteLength) {
                this.adjustPoints = engine.applyCompassRule(rawItems, boundaryLineType, misclose.compassCompleteLength)
            }
        }

        // 2. draw with rotation/scale applied
        const drawItems = this.getTransformedItems()
        let result = engine.computeTraverse(this.startPoint4326, drawItems, boundaryLineType, this.adjustPoints)

        // 3. honour a moved rotation anchor: shift start so the anchor node stays put
        if (this.rotationPointIndex >= 0 && this.rotationAnchor4326 && result.points[this.rotationPointIndex]) {
            const anchorNow = result.points[this.rotationPointIndex]
            const inv = geo.getInverseCalculations(anchorNow, this.rotationAnchor4326)
            if (inv && inv.distance > 0) {
                const shiftedStart = geo.getDestinationPoint(this.startPoint4326, inv.initialBearing, inv.distance)
                result = engine.computeTraverse(shiftedStart, drawItems, boundaryLineType, this.adjustPoints)
                this.effectiveStart4326 = shiftedStart
            } else {
                this.effectiveStart4326 = this.startPoint4326
            }
        } else {
            this.effectiveStart4326 = this.startPoint4326
        }

        this.lastDrawResult = result
        await this.drawGraphics(result, forceZoom)
        this.setState({ misclose })
    }

    effectiveStart4326: Point = null
    rotationAnchor4326: Point = null

    getMiscloseSnapDistanceMeters(): number {
        const config = this.props.config
        const v = config.miscloseSnapDistance
        switch (config.miscloseSnapDistanceUnit) {
            case 'feet': return feetToMeters(v)
            case 'uSSurveyFeet': return usSurveyFeetToMeters(v)
            default: return v
        }
    }

    async drawGraphics(result: engine.DrawResult, forceZoom: boolean): Promise<void> {
        const view = this.jimuMapView.view
        const mapSR = view.spatialReference
        this.linesLayer.removeAll()
        this.pointsLayer.removeAll()
        this.labelsLayer?.removeAll()

        const lineTypes = this.getLineTypes()
        const config = this.props.config
        const colorOverride = this.state.traverseColor ? hexToRgba(this.state.traverseColor) : null

        for (const line of result.lines) {
            let symbolJson = lineTypes.find(lt => lt.type === line.item.lineType)?.symbol
            if (symbolJson && colorOverride) {
                symbolJson = { ...(symbolJson.asMutable ? symbolJson.asMutable({ deep: true }) : symbolJson), color: colorOverride }
            }
            const projected = await geo.getProjectedGeometry(line.geometry, mapSR)
            this.linesLayer.add(new Graphic({
                geometry: projected,
                symbol: symbolJson ? (symbolJsonUtils as any).fromJSON(toEsriJsonSymbol(symbolJson)) : undefined
            }))
            // leg label at the geometry midpoint: bearing over distance, per plan settings
            if (this.state.showLabels && this.TextSymbolClass) {
                const midpoint = getPathMidpoint(line.geometry)
                if (midpoint) {
                    const projectedMid = await geo.getProjectedGeometry(midpoint, mapSR)
                    const ps = this.state.planSettings
                    const bearingText = getBearingForPlanSettings(line.item.bearingConversions, ps)
                    const c = line.item.lengthConversions
                    const distText = c
                        ? (ps.distanceAndLengthUnits === 'meters' ? c.metersRound : ps.distanceAndLengthUnits === 'feet' ? c.feetRound : c.uSSurveyFeetRound)
                        : ''
                    const unitAbbrev = ps.distanceAndLengthUnits === 'meters' ? 'm' : ps.distanceAndLengthUnits === 'feet' ? 'ft' : 'usft'
                    this.labelsLayer.add(new Graphic({
                        geometry: projectedMid,
                        symbol: new this.TextSymbolClass({
                            text: `${bearingText}\n${distText} ${unitAbbrev}`,
                            color: colorOverride ?? [29, 29, 53, 255],
                            haloColor: [255, 255, 255, 220],
                            haloSize: 1.5,
                            font: { size: 9, family: 'sans-serif' },
                            yoffset: 6
                        })
                    }))
                }
            }
        }

        // node points
        for (let i = 0; i < result.points.length; i++) {
            const projected = await geo.getProjectedGeometry(result.points[i], mapSR)
            const isRotationAnchor = i === this.rotationPointIndex
            this.pointsLayer.add(new Graphic({
                geometry: projected,
                symbol: (symbolJsonUtils as any).fromJSON(toEsriJsonSymbol(
                    isRotationAnchor ? config.startOrRotationSymbol : config.pointSymbol))
            }))
        }

        // start / rotation symbol at effective start
        if (this.effectiveStart4326) {
            const projectedStart = await geo.getProjectedGeometry(this.effectiveStart4326, mapSR)
            this.pointsLayer.add(new Graphic({
                geometry: projectedStart,
                symbol: (symbolJsonUtils as any).fromJSON(toEsriJsonSymbol(
                    this.rotationPointIndex === -1 ? config.startOrRotationSymbol : config.pointSymbol))
            }))
        }

        if (forceZoom && this.effectiveStart4326) {
            const projectedStart = await geo.getProjectedGeometry(this.effectiveStart4326, mapSR)
            void view.goTo({ target: projectedStart, scale: Math.min(view.scale, 2500) }).catch(() => { })
        }
    }

    setRotationPointFromClick(clicked4326: Point): void {
        if (!this.lastDrawResult) return
        // find nearest node (including start)
        const candidates: Array<{ index: number, point: Point }> = [
            { index: -1, point: this.effectiveStart4326 ?? this.startPoint4326 },
            ...this.lastDrawResult.points.map((p, i) => ({ index: i, point: p }))
        ]
        let best = candidates[0]
        let bestDist = Infinity
        for (const c of candidates) {
            const d = geo.getDistanceBetweenPoints(clicked4326, c.point)
            if (d < bestDist) { bestDist = d; best = c }
        }
        this.rotationPointIndex = best.index
        this.rotationAnchor4326 = best.point
        this.setState({ mapClickMode: 'digitize' }, () => { void this.redraw() })
    }

    // ------------------------------------------------------------ edit traverse

    async loadTraverseFromLines(clickedMapPoint: Point): Promise<void> {
        const lineLayer = await this.resolveLayer(this.props.config.lineLayerDsId)
        if (!lineLayer) {
            this.setState({ message: { text: this.nls('noLineLayer'), type: 'error' } })
            return
        }
        const polygonLayer = await this.resolveLayer(this.props.config.polygonLayerDsId)
        const view = this.jimuMapView.view
        const tolerance = this.props.config.snappingTolerance * view.resolution

        // full parcel selection: polygon footprint for closed parcels, connectivity
        // walk for unclosed boundaries; lines come back chained end-to-start
        const selection = await selectParcelAtPoint(clickedMapPoint, tolerance, lineLayer, polygonLayer)
        if (!selection.lineFeatures.length) {
            this.setState({ message: { text: this.nls('noFeaturesFound'), type: 'error' } })
            return
        }

        const fm = this.props.config.lineFieldMap
        const items: TraverseItem[] = []
        const lineObjectIds: number[] = []
        let start: Point | null = null
        for (const f of selection.lineFeatures) {
            const attrs = f.attributes
            // Field names are read without case: a hosted layer may return
            // 'direction' where the configuration (and a map service) says 'Direction'.
            const bearingVal = readAttribute(attrs, fm.bearing)
            const distVal = readAttribute(attrs, fm.distance)
            if (bearingVal == null || distVal == null) continue
            const radiusVal = readAttribute(attrs, fm.radius)
            const lineTypeVal = readAttribute(attrs, fm.lineType) ?? this.props.config.boundaryLineType
            const item = this.buildItemFromStoredValues(Number(bearingVal), Number(distVal),
                radiusVal != null ? Number(radiusVal) : 0, Number(lineTypeVal))
            if (item) {
                items.push(item)
                lineObjectIds.push(attrs[lineLayer.objectIdField])
            }
            if (!start) {
                const geom = f.geometry as __esri.Polyline
                const firstVertex = geom.getPoint(0, 0)
                start = await geo.getProjectedGeometry(firstVertex, WGS84) as Point
            }
        }
        if (!items.length || !start) {
            // Lines were found but none carried usable values: almost always a field
            // mapping that does not match this layer. Name the fields instead of the
            // generic "nothing found" so the fix is obvious.
            const missing = getMissingFields(lineLayer, [fm.bearing, fm.distance, fm.radius, fm.lineType])
            this.setState({
                message: {
                    text: missing.length > 0
                        ? this.nls('fieldsNotOnLayer').replace('{fields}', missing.join(', '))
                        : this.nls('noFeaturesFound'),
                    type: 'error'
                }
            })
            return
        }

        // edit session: save will UPDATE the polygon and REPLACE these lines
        const editSession: EditSession = {
            polygonObjectId: null,
            lineObjectIds
        }
        // prefill plan info + configured attributes from the existing polygon
        let planName = ''
        let planDescription = ''
        let statedArea = ''
        const planAttrs: { [k: string]: any } = {}
        if (selection.polygonFeature && polygonLayer) {
            editSession.polygonObjectId = selection.polygonFeature.attributes[polygonLayer.objectIdField]
            const pfm = this.props.config.polygonFieldMap
            const pAttrs = selection.polygonFeature.attributes
            const read = (field: string): string => {
                const value = readAttribute(pAttrs, field)
                return value != null ? String(value) : ''
            }
            planName = read(pfm.name)
            planDescription = read(pfm.description)
            statedArea = read(pfm.statedArea)
            for (const af of this.state.attributeFields) {
                const value = readAttribute(pAttrs, af.name)
                if (value != null) planAttrs[af.name] = value
            }
        }

        this.startPoint4326 = start
        this.rotationPointIndex = -1
        this.setState({
            page: 'traverse',
            startPointSet: true,
            items,
            editSession,
            planName,
            planDescription,
            statedArea,
            planAttrs,
            mapClickMode: 'digitize',
            message: { text: this.nls('editLoaded'), type: 'success' }
        }, () => { void this.redraw(true) })
    }

    buildItemFromStoredValues(naDD: number, distanceMeters: number, radiusMeters: number, lineType: number): TraverseItem | null {
        const bearingConversions = buildBearingConversions(naDD, String(naDD))
        const lengthConversions = categorizeLengthFormat(String(distanceMeters), 'meters')
        if (!lengthConversions) return null
        const hasRadius = radiusMeters !== 0 && !isNaN(radiusMeters)
        const radiusConversions = hasRadius ? categorizeLengthFormat(String(radiusMeters), 'meters') : null
        const chordLengthConversions = hasRadius ? lengthConversions : null
        const ps = this.state.planSettings
        const displayDist = ps.distanceAndLengthUnits === 'meters'
            ? lengthConversions.metersRound
            : ps.distanceAndLengthUnits === 'feet' ? lengthConversions.feetRound : lengthConversions.uSSurveyFeetRound
        const displayRadius = radiusConversions
            ? (ps.distanceAndLengthUnits === 'meters'
                ? radiusConversions.metersRound
                : ps.distanceAndLengthUnits === 'feet' ? radiusConversions.feetRound : radiusConversions.uSSurveyFeetRound)
            : ''
        return {
            bearing: naDD.toFixed(4),
            distance: displayDist,
            radius: displayRadius,
            lineType,
            bearingConversions,
            lengthConversions,
            chordLengthConversions,
            radiusConversions
        }
    }

    // ------------------------------------------------------------ save

    async resolveLayer(dsId: string): Promise<__esri.FeatureLayer | null> {
        if (!dsId) return null
        const ds: any = DataSourceManager.getInstance().getDataSource(dsId)
        if (!ds) return null
        if (ds.layer) return ds.layer
        if (ds.createJSAPILayerByDataSource) {
            try { return await ds.createJSAPILayerByDataSource() } catch { return null }
        }
        return null
    }

    onSave = async (): Promise<void> => {
        if (!this.lastDrawResult || !this.effectiveStart4326) return
        this.setState({ saving: true, message: null })
        try {
            const [pointLayer, lineLayer, polygonLayer] = await Promise.all([
                this.resolveLayer(this.props.config.pointLayerDsId),
                this.resolveLayer(this.props.config.lineLayerDsId),
                this.resolveLayer(this.props.config.polygonLayerDsId)
            ])
            if (!pointLayer && !lineLayer && !polygonLayer) {
                this.setState({ saving: false, message: { text: this.nls('noLayersConfigured'), type: 'error' } })
                return
            }
            const m = this.state.misclose
            const hasBoundaryLines = this.lastDrawResult.lines.some(l => l.isBoundary)
            const result = await saveTraverse(
                { pointLayer, lineLayer, polygonLayer },
                this.lastDrawResult.lines,
                this.lastDrawResult.points,
                this.effectiveStart4326,
                {
                    name: this.state.planName,
                    description: this.state.planDescription,
                    statedArea: this.state.statedArea,
                    miscloseRatio: m?.miscloseRatio ?? '',
                    miscloseDistance: m?.miscloseDistanceMeters ?? 0,
                    rotation: this.state.rotation,
                    scale: this.state.scale,
                    attributeValues: this.state.planAttrs
                },
                this.props.config.lineFieldMap as any,
                this.props.config.polygonFieldMap as any,
                this.props.config.boundaryLineType,
                this.state.editSession
            )
            const wasEdit = !!this.state.editSession
            let messageText = this.props.intl.formatMessage(
                {
                    id: wasEdit ? 'updateSuccess' : 'saveSuccess',
                    defaultMessage: (defaultMessages as any)[wasEdit ? 'updateSuccess' : 'saveSuccess']
                },
                { lines: result.lineCount, points: result.pointCount })
            let messageType: 'error' | 'success' = 'success'
            if (polygonLayer) {
                if (result.polygonAdded) {
                    messageText += ' ' + this.nls(wasEdit ? 'polygonUpdated' : 'polygonSaved')
                } else if (!hasBoundaryLines) {
                    // WAB parity guard: the polygon is built from Boundary Lines only, so a
                    // traverse drawn entirely as Connection Lines saves no parcel. Say so
                    // instead of failing silently.
                    messageText += ' ' + this.nls('noBoundaryLinesOnSave')
                    messageType = 'error'
                }
            }
            // Configured fields the target layers do not have are skipped silently by
            // the edit, which looks like a successful save with empty attributes. Name
            // them so a field mapping left over from a different service is visible.
            const fm = this.props.config.lineFieldMap
            const pfm = this.props.config.polygonFieldMap
            const missing = [
                ...getMissingFields(lineLayer, [fm.bearing, fm.distance, fm.radius, fm.arcLength, fm.lineType]),
                ...getMissingFields(polygonLayer, [
                    pfm.name, pfm.description, pfm.statedArea,
                    pfm.miscloseRatio, pfm.miscloseDistance, pfm.rotation, pfm.scale
                ])
            ]
            if (missing.length > 0) {
                messageText += ' ' + this.nls('fieldsSkippedOnSave').replace('{fields}', missing.join(', '))
            }
            this.setState({
                saving: false,
                editSession: null, // a completed edit save ends the session
                message: { text: messageText, type: messageType }
            })
        } catch (err) {
            console.error(err)
            this.setState({ saving: false, message: { text: this.nls('saveFailed'), type: 'error' } })
        }
    }

    /** Resolve the runtime attribute inputs for the polygon layer per the configured
     *  attribute settings: 'popup' derives editable fields from the layer's popup
     *  template; 'custom' uses the configured list; 'legacy' keeps the fixed inputs. */
    async loadAttributeFields(): Promise<void> {
        const settings: any = this.props.config.polygonAttributes
        const mode = settings?.mode ?? 'legacy'
        if (mode === 'legacy') {
            this.setState({ attributeFields: [] })
            return
        }
        const layer = await this.resolveLayer(this.props.config.polygonLayerDsId)
        if (!layer) {
            this.setState({ attributeFields: [] })
            return
        }
        try { await layer.load?.() } catch (e) { /* field list may still be available */ }
        const editableFields = (layer.fields ?? []).filter((f: any) =>
            f.editable !== false &&
            !['oid', 'global-id', 'geometry'].includes(f.type) &&
            f.name !== layer.objectIdField)

        let fields: AttributeFieldRuntime[] = []
        if (mode === 'popup') {
            const fieldInfos: any[] = (layer.popupTemplate?.fieldInfos ?? []) as any[]
            if (fieldInfos.length > 0) {
                fields = fieldInfos
                    .map(fi => {
                        const lf = editableFields.find((f: any) => f.name.toLowerCase() === String(fi.fieldName).toLowerCase())
                        return lf ? { name: lf.name, alias: fi.label || lf.alias || lf.name, type: lf.type } : null
                    })
                    .filter(Boolean) as AttributeFieldRuntime[]
            } else {
                // no popup configured: fall back to all editable fields
                fields = editableFields.map((f: any) => ({ name: f.name, alias: f.alias || f.name, type: f.type }))
            }
        } else { // custom
            const configured: any[] = (settings.fields as any)?.asMutable
                ? (settings.fields as any).asMutable({ deep: true })
                : (settings.fields ?? [])
            fields = configured
                .map(cf => {
                    const lf = editableFields.find((f: any) => f.name.toLowerCase() === String(cf.name).toLowerCase())
                    return lf ? { name: lf.name, alias: cf.alias || lf.alias || lf.name, type: lf.type } : null
                })
                .filter(Boolean) as AttributeFieldRuntime[]
        }
        this.setState({ attributeFields: fields })
    }

    componentDidMount(): void {
        void this.loadAttributeFields()
    }

    componentDidUpdate(prevProps: AllWidgetProps<IMConfig>, prevState: State): void {
        if (prevProps.config !== this.props.config) {
            void this.loadAttributeFields()
        }
        if (prevState.mapClickMode !== this.state.mapClickMode) {
            this.syncMapMode()
        }
        if (prevState.snappingEnabled !== this.state.snappingEnabled && this.snapSVM) {
            this.snapSVM.snappingOptions.enabled = this.state.snappingEnabled
        }
    }

    /** Download the traverse as GeoJSON (WGS84 per spec; our geometry is already
     *  4326 and arcs are densified, so exported curves actually curve). */
    exportGeoJSON = (): void => {
        if (!this.lastDrawResult || this.state.items.length === 0) {
            this.setState({ message: { text: this.nls('exportEmpty'), type: 'error' } })
            return
        }
        const features: any[] = []
        const start = this.effectiveStart4326 ?? this.startPoint4326
        if (start) {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [start.x, start.y] },
                properties: { type: 'start' }
            })
        }
        this.lastDrawResult.points.forEach((pt, i) => {
            features.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [pt.x, pt.y] },
                properties: { type: 'node', index: i + 1 }
            })
        })
        const boundaryPaths: number[][][] = []
        this.lastDrawResult.lines.forEach((line, i) => {
            const item = line.item
            features.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: line.geometry.paths[0].map(v => [v[0], v[1]]) },
                properties: {
                    index: i + 1,
                    bearingNADD: item.bearingConversions.naDD,
                    distanceMeters: item.lengthConversions?.meters ?? null,
                    radiusMeters: item.radiusConversions?.meters ?? null,
                    lineType: item.lineType,
                    isBoundary: line.isBoundary
                }
            })
            if (line.isBoundary) {
                for (const p of line.geometry.paths) boundaryPaths.push(p as any)
            }
        })
        if (boundaryPaths.length > 0) {
            const polygon = geo.getPolygonFromPolyLines(boundaryPaths, false, true)
            if (polygon.rings.length > 0) {
                features.push({
                    type: 'Feature',
                    geometry: { type: 'Polygon', coordinates: polygon.rings.map(ring => ring.map(v => [v[0], v[1]])) },
                    properties: {
                        type: 'parcel',
                        name: this.state.planName,
                        miscloseRatio: this.state.misclose?.miscloseRatio ?? null,
                        miscloseDistanceMeters: this.state.misclose?.miscloseDistanceMeters ?? null,
                        rotation: this.state.rotation,
                        scale: this.state.scale
                    }
                })
            }
        }
        const geojson = { type: 'FeatureCollection', features }
        const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = (this.state.planName ? this.state.planName.replace(/[^\w-]+/g, '_') : 'traverse') + '.geojson'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    /** Draft metes and bounds legal description per AH 215 conventions:
     *  commencement for leading connection lines, Point of Beginning, thence
     *  courses with quadrant bearings, curve radius/arc/chord language, and a
     *  closing acreage statement. Output is a DRAFT for staff review. */
    buildLegalDescription = (): string => {
        const items = this.state.items
        const ps = this.state.planSettings
        const boundaryType = this.props.config.boundaryLineType
        const unitWord = ps.distanceAndLengthUnits === 'meters'
            ? 'meters'
            : ps.distanceAndLengthUnits === 'feet' ? 'feet' : 'US survey feet'
        const metersToUnit = (mt: number): number =>
            ps.distanceAndLengthUnits === 'meters' ? mt : ps.distanceAndLengthUnits === 'feet' ? metersToFeet(mt) : metersToUSSurveyFeet(mt)
        const distOf = (c: LengthConversions | null): string => {
            if (!c) return ''
            const v = ps.distanceAndLengthUnits === 'meters' ? c.meters : ps.distanceAndLengthUnits === 'feet' ? c.feet : c.uSSurveyFeet
            return Math.abs(v).toFixed(2)
        }
        const bearingWords = (qb3DMS: string): string => {
            // 'N45-30-00E' -> 'North 45\u00B030'00" East'
            const m = /^([NS])(\d{1,3})-(\d{2})-(\d{2})([EW])$/.exec(qb3DMS)
            if (!m) return qb3DMS
            const ns = m[1] === 'N' ? 'North' : 'South'
            const ew = m[5] === 'E' ? 'East' : 'West'
            return `${ns} ${Number(m[2])}\u00B0${m[3]}'${m[4]}" ${ew}`
        }
        const courseText = (item: TraverseItem): string => {
            const hasRadius = !(item.radius === '' || item.radius === '0' || Number(item.radius) === 0) && item.radiusConversions
            if (!hasRadius) {
                return `thence ${bearingWords(item.bearingConversions.qb3DMS)}, ${distOf(item.lengthConversions)} ${unitWord}`
            }
            const radiusM = Math.abs(item.radiusConversions.meters)
            const chordM = item.chordLengthConversions ? item.chordLengthConversions.meters : 0
            const arcM = geo.getArcLengthFromChordLength(chordM, radiusM)
            const direction = item.radiusConversions.meters > 0 ? 'right' : 'left'
            return `thence along a curve to the ${direction} having a radius of ${metersToUnit(radiusM).toFixed(2)} ${unitWord} ` +
                `and an arc length of ${metersToUnit(arcM).toFixed(2)} ${unitWord}, ` +
                `the chord of which bears ${bearingWords(item.bearingConversions.qb3DMS)}, ${distOf(item.chordLengthConversions)} ${unitWord}`
        }

        const start = this.effectiveStart4326 ?? this.startPoint4326
        const coordText = start ? `longitude ${start.x.toFixed(6)}, latitude ${start.y.toFixed(6)} (WGS84)` : 'the described point'

        // leading connection lines are the commencement tie to the Point of Beginning
        let firstBoundaryIndex = items.findIndex(i => i.lineType === boundaryType)
        if (firstBoundaryIndex < 0) firstBoundaryIndex = 0
        const tieLines = items.slice(0, firstBoundaryIndex)
        const boundaryLines = items.slice(firstBoundaryIndex)

        const lines: string[] = []
        lines.push('DRAFT LEGAL DESCRIPTION - generated by Parcel Drafter. Review required before use in any document.')
        lines.push('')
        if (this.state.planName) lines.push(this.state.planName)
        if (this.state.planDescription) lines.push(this.state.planDescription)
        if (this.state.planName || this.state.planDescription) lines.push('')

        if (tieLines.length > 0) {
            lines.push(`Commencing at a point at ${coordText};`)
            tieLines.forEach(item => lines.push(courseText(item) + ';'))
            lines.push('to the Point of Beginning;')
        } else {
            lines.push(`Beginning at a point at ${coordText};`)
        }
        boundaryLines.forEach(item => lines.push(courseText(item) + ';'))

        const m = this.state.misclose
        if (m) {
            lines.push('to the Point of Beginning.')
            if (m.areaConversions) {
                const acres = m.areaConversions.acres
                lines.push('')
                lines.push(`Containing ${acres.toFixed(3)} acres, more or less.`)
            }
        } else {
            lines.push('to the point of ending.')
        }
        return lines.join('\n')
    }

    exportLegalDescription = (): void => {
        if (this.state.items.length === 0) {
            this.setState({ message: { text: this.nls('exportEmpty'), type: 'error' } })
            return
        }
        const text = this.buildLegalDescription()
        const blob = new Blob([text], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = (this.state.planName ? this.state.planName.replace(/[^\w-]+/g, '_') : 'traverse') + '_legal_draft.txt'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    // ------------------------------------------------------------ page actions

    startNewTraverse = (): void => {
        this.clearAll()
        // the start point entry panel already shows the click-or-type instruction
        this.setState({
            page: 'traverse',
            mapClickMode: 'startPoint',
            message: null
        })
    }

    startEditTraverse = (): void => {
        this.clearAll()
        this.setState({
            page: 'home',
            mapClickMode: 'editSelect',
            // the home page renders the click-to-select instruction as an info notice
            message: null
        })
    }

    setStartFromXY = (x: string, y: string): void => {
        const lon = parseFloat(x)
        const lat = parseFloat(y)
        if (isNaN(lon) || isNaN(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
            this.setState({ message: { text: this.nls('invalidXY'), type: 'error' } })
            return
        }
        this.startPoint4326 = new Point({ x: lon, y: lat, spatialReference: { wkid: 4326 } })
        this.setState({ startPointSet: true, mapClickMode: 'digitize', message: null },
            () => { void this.redraw(true) })
    }

    clearAll = (): void => {
        this.startPoint4326 = null
        this.effectiveStart4326 = null
        this.rotationAnchor4326 = null
        this.rotationPointIndex = -1
        this.lastDrawResult = null
        this.adjustPoints = false
        this.linesLayer?.removeAll()
        this.pointsLayer?.removeAll()
        this.labelsLayer?.removeAll()
        this.snapScratchLayer?.removeAll()
        this.dragStart = null
        this.setState({
            items: [],
            startPointSet: false,
            misclose: null,
            rotation: 0,
            scale: 1,
            planName: '',
            planDescription: '',
            statedArea: '',
            planAttrs: {},
            editSession: null,
            dragMode: 'none',
            mapClickMode: 'none',
            message: null,
            currentLineType: this.getDefaultLineTypeCode()
        })
    }

    // ------------------------------------------------------------ render

    onRootKeyDown = (evt: React.KeyboardEvent): void => {
        if (evt.key === 'Escape' && this.state.mapClickMode !== 'none') {
            // leave anchor-picking back into digitize; otherwise fully deactivate map tools
            const next = this.state.mapClickMode === 'rotationPoint' && this.state.startPointSet
                ? 'digitize'
                : 'none'
            this.setState({ mapClickMode: next })
        }
    }

    render(): React.ReactElement {
        const strings = new Proxy({}, { get: (_t, key: string) => this.nls(key) }) as any
        const { state } = this
        const useMapWidgetId = this.props.useMapWidgetIds?.[0]

        return (
            <div css={widgetStyle} className='jimu-widget' onKeyDown={this.onRootKeyDown}
                title={state.mapClickMode !== 'none' ? strings.escToExitTip : undefined}>
                {useMapWidgetId && (
                    <JimuMapViewComponent useMapWidgetId={useMapWidgetId} onActiveViewChange={this.onActiveViewChange} />
                )}
                {!useMapWidgetId && <div className='pd-hint'>{strings.selectMapWidget}</div>}

                {state.page === 'home' && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <h2 className='pd-section-title' style={{ flex: 1 }}>{strings.widgetTitle}</h2>
                            <Button size='sm' type='tertiary' icon onClick={this.openHelp}
                                title={strings.helpTitle} aria-label={strings.helpTitle} style={{ flexShrink: 0 }}>
                                <CalciteIcon icon='question' scale='s' />
                            </Button>
                        </div>
                        {state.showFirstRunHint && (
                            <FirstRunHint
                                title={strings.firstRunTitle}
                                body={strings.firstRunBody}
                                helpLink={strings.firstRunHelpLink}
                                dismissLabel={strings.firstRunDismiss}
                                onOpenHelp={this.openHelp}
                                onDismiss={this.dismissFirstRunHint}
                            />
                        )}
                        <div className='pd-toolbar'>
                            <Tooltip title={strings.newTraverseTip}>
                                <Button type='primary' onClick={this.startNewTraverse}>{strings.newTraverse}</Button>
                            </Tooltip>
                            <Tooltip title={strings.editTraverseTip}>
                                <Button type='secondary' onClick={this.startEditTraverse}>{strings.editTraverse}</Button>
                            </Tooltip>
                        </div>
                        {state.mapClickMode === 'editSelect' && <InfoNote>{strings.clickToSelectParcel}</InfoNote>}
                    </div>
                )}

                {state.page === 'traverse' && (
                    <div>
                        <div className='pd-toolbar' role='toolbar' aria-label={strings.widgetTitle}>
                            <Tooltip title={strings.backTip}>
                                <Button size='sm' type='tertiary' aria-label={strings.back}
                                    onClick={() => { this.clearAll(); this.setState({ page: 'home' }) }}>
                                    ← {strings.back}
                                </Button>
                            </Tooltip>
                            <Tooltip title={strings.planSettingsTip}>
                                <Button size='sm' type={state.showPlanSettings ? 'primary' : 'secondary'}
                                    aria-pressed={state.showPlanSettings}
                                    aria-expanded={state.showPlanSettings}
                                    onClick={() => this.setState({ showPlanSettings: !state.showPlanSettings })}>
                                    {strings.planSettings}
                                </Button>
                            </Tooltip>
                            <Tooltip title={strings.digitizeTip}>
                                <span style={{ display: 'inline-flex' }}>
                                    <Button size='sm' type={state.mapClickMode === 'digitize' ? 'primary' : 'secondary'}
                                        disabled={!state.startPointSet}
                                        aria-pressed={state.mapClickMode === 'digitize'}
                                        onClick={() => this.setState({ mapClickMode: state.mapClickMode === 'digitize' ? 'none' : 'digitize' })}>
                                        {strings.digitize}
                                    </Button>
                                </span>
                            </Tooltip>
                            <Tooltip title={strings.drawLineTypeTip}>
                                <span style={{ display: 'inline-flex', minWidth: 140 }}>
                                    <Select size='sm' value={state.currentLineType}
                                        aria-label={strings.lineType}
                                        onChange={(evt: any) => this.setState({ currentLineType: Number(evt.target.value) })}>
                                        {this.getLineTypes().map(lt => (
                                            <Option key={lt.type} value={lt.type}>{lt.label}</Option>
                                        ))}
                                    </Select>
                                </span>
                            </Tooltip>
                            <Tooltip title={strings.zoomToTip}>
                                <span style={{ display: 'inline-flex' }}>
                                    <Button size='sm' type='secondary' disabled={!state.startPointSet}
                                        onClick={() => { void this.redraw(true) }}>
                                        {strings.zoomTo}
                                    </Button>
                                </span>
                            </Tooltip>
                            <Tooltip title={strings.legLabelsTip}>
                                <Button size='sm' type={state.showLabels ? 'primary' : 'secondary'}
                                    aria-pressed={state.showLabels}
                                    onClick={() => this.setState({ showLabels: !state.showLabels }, () => { void this.redraw() })}>
                                    {strings.legLabels}
                                </Button>
                            </Tooltip>
                            <Tooltip title={strings.snapToggleTip}>
                                <Button size='sm' type={state.snappingEnabled ? 'primary' : 'secondary'}
                                    aria-pressed={state.snappingEnabled}
                                    onClick={() => this.setState({ snappingEnabled: !state.snappingEnabled })}>
                                    {strings.snapToggle}
                                </Button>
                            </Tooltip>
                            <Tooltip title={strings.traverseColorTip}>
                                <span style={{ display: 'inline-flex' }}>
                                    <ColorPicker
                                        color={state.traverseColor || '#000000'}
                                        aria-label={strings.traverseColor}
                                        width={26} height={26}
                                        onChange={(color: string) => this.setState({ traverseColor: color }, () => { void this.redraw() })}
                                    />
                                </span>
                            </Tooltip>
                            <Button size='sm' type='tertiary' icon onClick={this.openHelp}
                                title={strings.helpTitle} aria-label={strings.helpTitle}
                                style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                <CalciteIcon icon='question' scale='s' />
                            </Button>
                        </div>

                        {state.showPlanSettings && (
                            <PlanSettingsPanel
                                planSettings={state.planSettings}
                                strings={strings}
                                onChange={ps => {
                                    this.setState({ planSettings: ps, showPlanSettings: false })
                                }}
                            />
                        )}

                        {!state.startPointSet && (
                            <StartPointEntry strings={strings} onApply={this.setStartFromXY} />
                        )}

                        {state.startPointSet && (
                            <div>
                                <TraverseGrid
                                    items={state.items}
                                    lineTypes={this.getLineTypes()}
                                    entryLineType={state.currentLineType}
                                    onEntryLineTypeChange={lt => this.setState({ currentLineType: lt })}
                                    planSettings={state.planSettings}
                                    onAddItem={this.onAddItem}
                                    onUpdateItem={this.onUpdateItem}
                                    onChangeLineType={this.onChangeLineType}
                                    onDeleteItem={this.onDeleteItem}
                                    onReorder={this.onReorder}
                                    strings={strings}
                                />

                                <ParcelTools
                                    rotation={state.rotation}
                                    scale={state.scale}
                                    updateRotationActive={state.mapClickMode === 'rotationPoint'}
                                    dragMode={state.dragMode}
                                    onRotationChange={rotation => this.setState({ rotation }, () => { void this.redraw() })}
                                    onScaleChange={scale => this.setState({ scale }, () => { void this.redraw() })}
                                    onToggleUpdateRotationPoint={() => {
                                        this.setState({
                                            mapClickMode: state.mapClickMode === 'rotationPoint' ? 'digitize' : 'rotationPoint'
                                        })
                                    }}
                                    onToggleDragMode={mode => {
                                        this.setState({ dragMode: state.dragMode === mode ? 'none' : mode })
                                    }}
                                    strings={strings}
                                />

                                <MiscloseDetailsPanel details={state.misclose} planSettings={state.planSettings} strings={strings} />

                                <h3 className='pd-section-title'>{strings.planInfo}</h3>
                                {state.editSession && (
                                    <InfoNote role='status'>{strings.editingExisting}</InfoNote>
                                )}
                                <div className='pd-plan-info' role='group' aria-label={strings.planInfo}>
                                    <TextInput size='sm' placeholder={strings.planName} value={state.planName}
                                        aria-label={strings.planName} title={strings.planNameTip}
                                        onChange={evt => this.setState({ planName: evt.target.value })} />
                                    <TextInput size='sm' placeholder={strings.planDescription} value={state.planDescription}
                                        aria-label={strings.planDescription} title={strings.planDescriptionTip}
                                        onChange={evt => this.setState({ planDescription: evt.target.value })} />
                                    <TextInput size='sm' placeholder={strings.statedArea} value={state.statedArea}
                                        aria-label={strings.statedArea} title={strings.statedAreaTip}
                                        onChange={evt => this.setState({ statedArea: evt.target.value })} />
                                    {state.attributeFields.map(field => (
                                        <TextInput key={field.name} size='sm'
                                            placeholder={field.alias}
                                            value={state.planAttrs[field.name] ?? ''}
                                            aria-label={field.alias}
                                            title={`${strings.attributeFieldTip} ${field.name}`}
                                            onChange={evt => this.setState({
                                                planAttrs: { ...this.state.planAttrs, [field.name]: evt.target.value }
                                            })} />
                                    ))}
                                </div>
                                <div className='pd-toolbar' style={{ marginTop: 8 }}>
                                    <Tooltip title={strings.saveTip}>
                                        <span style={{ display: 'inline-flex' }}>
                                            <Button type='primary' disabled={state.items.length === 0 || state.saving}
                                                onClick={() => { void this.onSave() }}>
                                                {strings.save}
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title={strings.exportGeoJSONTip}>
                                        <span style={{ display: 'inline-flex' }}>
                                            <Button type='secondary' disabled={state.items.length === 0}
                                                onClick={this.exportGeoJSON}>
                                                {strings.exportGeoJSON}
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title={strings.legalDescriptionTip}>
                                        <span style={{ display: 'inline-flex' }}>
                                            <Button type='secondary' disabled={state.items.length === 0}
                                                onClick={this.exportLegalDescription}>
                                                {strings.legalDescription}
                                            </Button>
                                        </span>
                                    </Tooltip>
                                    <Tooltip title={strings.clearAllTip}>
                                        <Button type='secondary' onClick={this.clearAll}>{strings.clearAll}</Button>
                                    </Tooltip>
                                    {state.saving && (
                                        <span role='status' aria-label={strings.saving}>
                                            <Loading width={20} height={20} />
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {state.message && (
                    <div className={`pd-message ${state.message.type}`}
                        role={state.message.type === 'error' ? 'alert' : 'status'}
                        aria-live={state.message.type === 'error' ? 'assertive' : 'polite'}>
                        {state.message.text}
                    </div>
                )}

                <HelpPopup
                    open={state.helpOpen}
                    onClose={() => { this.setState({ helpOpen: false }) }}
                    sections={buildHelpSections(this.nls, this.helpFeatures())}
                    title={strings.helpTitle}
                    intro={strings.helpIntro}
                    searchPlaceholder={strings.helpSearchPlaceholder}
                    noMatches={strings.helpNoMatches}
                    closeLabel={strings.close}
                />
            </div>
        )
    }
}

function StartPointEntry(props: { strings: any, onApply: (x: string, y: string) => void }): React.ReactElement {
    const [x, setX] = React.useState('')
    const [y, setY] = React.useState('')
    const onKeyDown = (evt: React.KeyboardEvent): void => {
        if (evt.key === 'Enter') props.onApply(x, y)
    }
    return (
        <div role='group' aria-label={props.strings.startPointEntryLabel}>
            <InfoNote>{props.strings.clickToSetStartPoint}</InfoNote>
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <div>
                    <Label for='pd-start-lon'>{props.strings.longitude}</Label>
                    <TextInput size='sm' id='pd-start-lon' value={x}
                        aria-label={props.strings.longitude}
                        title={props.strings.longitudeTip}
                        onChange={evt => setX(evt.target.value)} onKeyDown={onKeyDown} />
                </div>
                <div>
                    <Label for='pd-start-lat'>{props.strings.latitude}</Label>
                    <TextInput size='sm' id='pd-start-lat' value={y}
                        aria-label={props.strings.latitude}
                        title={props.strings.latitudeTip}
                        onChange={evt => setY(evt.target.value)} onKeyDown={onKeyDown} />
                </div>
                <Button size='sm' type='secondary' onClick={() => props.onApply(x, y)}>
                    {props.strings.apply}
                </Button>
            </div>
        </div>
    )
}

/** Convert autocast-ish symbol json in config to esri REST symbol JSON for jsonUtils.fromJSON. */
function toEsriJsonSymbol(symbol: any): any {
    const s = symbol?.asMutable ? symbol.asMutable({ deep: true }) : JSON.parse(JSON.stringify(symbol))
    const colorTo255 = (c: number[]): number[] => {
        if (!Array.isArray(c)) return c
        const alpha = c.length === 4 ? (c[3] <= 1 ? Math.round(c[3] * 255) : c[3]) : 255
        return [c[0], c[1], c[2], alpha]
    }
    if (s.type === 'simple-marker') {
        return {
            type: 'esriSMS',
            style: 'esriSMS' + capitalize(s.style ?? 'circle'),
            color: colorTo255(s.color),
            size: s.size,
            outline: s.outline
                ? { type: 'esriSLS', style: 'esriSLSSolid', color: colorTo255(s.outline.color), width: s.outline.width }
                : undefined
        }
    }
    if (s.type === 'simple-line') {
        return {
            type: 'esriSLS',
            style: 'esriSLS' + capitalize(s.style ?? 'solid'),
            color: colorTo255(s.color),
            width: s.width
        }
    }
    return s // assume already esri REST json
}

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Midpoint vertex of a polyline's first path (4326). */
function getPathMidpoint(geometry: __esri.Polyline): Point | null {
    const path = geometry?.paths?.[0]
    if (!path || path.length === 0) return null
    const mid = path[Math.floor(path.length / 2)]
    return new Point({ x: mid[0], y: mid[1], spatialReference: { wkid: 4326 } })
}

/** '#rrggbb' to [r,g,b,a] for symbol json. */
function hexToRgba(hex: string): number[] | null {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex)
    if (!m) return null
    const n = parseInt(m[1], 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
}