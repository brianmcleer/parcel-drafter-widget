/** Builder settings - replaces WAB setting/Setting.html/js.
 *
 * Design system: built on jimu-ui with the Calcite-aligned jimu theme tokens
 * (--sys-color-* / --ref-palette-* map to Calcite Design System tokens in ExB 1.13+).
 * Raw <calcite-*> web components are not registered in the Builder settings context,
 * so jimu-ui is the sanctioned Calcite-conformant component set here. Conventions
 * applied per the builder's own settings panels:
 * - SettingSection/SettingRow structure with an 8px spacing grid
 * - Labels with focusable info-icon Tooltips (not tooltip-on-text)
 * - Radio group for mutually exclusive modes
 * - Inline info notices (icon + tinted panel) for help text
 * - All colors from theme tokens; dark/light builder themes both supported
 *
 * Accessibility (WCAG 2.1 AA): every control has a programmatic name; tooltips are
 * keyboard-reachable via the info buttons and folded into control descriptions;
 * radio/checkbox groups are named; focus-visible outlines throughout.
 */
/** @jsx jsx */
import { React, jsx, css, Immutable, type UseDataSource, DataSourceManager } from 'jimu-core'
import * as jimuCore from 'jimu-core'
// AllDataSourceTypes is real in jimu-core but absent from the VS editor shim's
// typed member list; read it off the namespace so webpack and VS both accept it.
const AllDataSourceTypes: any = (jimuCore as any).AllDataSourceTypes
import { MapWidgetSelector, SettingSection, SettingRow } from 'jimu-ui/advanced/setting-components'
import { DataSourceSelector } from 'jimu-ui/advanced/data-source-selector'
import { TextInput, NumericInput, Select, Option, Tooltip, Checkbox, Radio, Label, Button } from 'jimu-ui'
import { InfoOutlined } from 'jimu-icons/outlined/suggested/info'
import { type IMConfig } from '../config'
import defaultMessages from './translations/default'

const style = css`
  /* 8px spacing grid, Calcite-aligned jimu theme tokens throughout */
  .pd-label-with-tip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }
  .pd-label-with-tip .pd-label-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pd-info-btn {
    flex: none;
    padding: 0;
    width: 16px;
    height: 16px;
    min-height: 16px;
    color: var(--sys-color-surface-paper-hint, var(--ref-palette-neutral-900));
  }
  .pd-info-btn:hover {
    color: var(--sys-color-primary-main);
  }
  .pd-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    padding: 8px;
    margin: 8px 0;
    font-size: 12px;
    line-height: 1.4;
    border-radius: 2px;
    color: var(--sys-color-info-text, var(--sys-color-surface-paper-text));
    background: var(--sys-color-info-light, var(--ref-palette-neutral-300));
    border-left: 3px solid var(--sys-color-info-main, var(--sys-color-primary-main));
  }
  .pd-note .jimu-icon { flex: none; margin-top: 1px; }
  .pd-radio-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    cursor: pointer;
  }
  .pd-radio-item:last-of-type { margin-bottom: 0; }
  .pd-attr-field-row {
    display: flex;
    gap: 8px;
    align-items: center;
    width: 100%;
    padding: 4px 0;
    border-bottom: 1px solid var(--sys-color-divider-secondary, transparent);
  }
  .pd-attr-field-row:last-of-type { border-bottom: none; }
  .pd-attr-field-row .pd-attr-name {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--sys-color-surface-paper-text);
  }
  .pd-attr-field-row .pd-attr-alias { flex: 1; }
  :focus-visible {
    outline: 2px solid var(--sys-color-primary-main);
    outline-offset: 1px;
  }
`

interface LayerField {
  name: string
  alias: string
  type: string
}

/**
 * Locally-typed setting props. Structurally identical to jimu-for-builder's
 * AllWidgetSettingProps<IMConfig>, but self-contained so the widget type-checks
 * even in IDE environments that resolve a broken/partial jimu-for-builder d.ts.
 * The runtime props Builder injects are unchanged.
 */
interface SettingProps {
  id: string
  config: IMConfig
  intl: { formatMessage: (descriptor: { id: string, defaultMessage?: string }, values?: any) => string }
  useDataSources?: any
  useMapWidgetIds?: any
  onSettingChange: (settings: {
    id: string
    config?: IMConfig
    useDataSources?: UseDataSource[]
    useMapWidgetIds?: string[]
  }) => void
}

interface SettingState {
  fieldsByDs: { [dsId: string]: LayerField[] }
}

export default class Setting extends React.PureComponent<SettingProps, SettingState> {
  // Type-only declarations (no emitted code): keep the checker happy even when the
  // IDE cannot resolve React's class typings through jimu-core.
  declare props: SettingProps
  declare state: SettingState
  // Loose on purpose: must stay assignable to both the real React 19 setState
  // (webpack build) and the mode B shim's PureComponent.setState (VS check).
  declare setState: (partial: any, callback?: () => void) => void

  constructor (props: SettingProps) {
    super(props)
    this.state = { fieldsByDs: {} }
  }

  nls = (id: string): string => {
    return this.props.intl.formatMessage({ id, defaultMessage: (defaultMessages as any)[id] })
  }

  componentDidMount (): void {
    void this.loadAllLayerFields()
  }

  componentDidUpdate (prevProps: SettingProps): void {
    if (prevProps.config !== this.props.config || prevProps.useDataSources !== this.props.useDataSources) {
      void this.loadAllLayerFields()
    }
  }

  // ------------------------------------------------------------ field schemas

  async loadAllLayerFields (): Promise<void> {
    const ids = [
      this.props.config.pointLayerDsId,
      this.props.config.lineLayerDsId,
      this.props.config.polygonLayerDsId
    ].filter(Boolean)
    for (const dsId of ids) {
      if (this.state.fieldsByDs[dsId]) continue
      const fields = await this.getLayerFields(dsId)
      if (fields.length > 0) {
        this.setState(prev => ({ fieldsByDs: { ...prev.fieldsByDs, [dsId]: fields } }))
      }
    }
  }

  async getDs (dsId: string): Promise<any> {
    if (!dsId) return null
    const dsm = DataSourceManager.getInstance()
    let ds: any = dsm.getDataSource(dsId)
    if (!ds) {
      // builder may not have instantiated the ds yet - create it from the UseDataSource
      const uds = (this.props.useDataSources ?? Immutable([]))
        .find((u: any) => u.dataSourceId === dsId)
      if (uds) {
        try {
          ds = await dsm.createDataSourceByUseDataSource(
            (uds as any).asMutable ? (uds as any).asMutable({ deep: true }) : uds)
        } catch (e) { /* fall through */ }
      }
    }
    return ds
  }

  async getLayerFields (dsId: string): Promise<LayerField[]> {
    try {
      const ds = await this.getDs(dsId)
      const schemaFields = ds?.getSchema?.()?.fields
      if (!schemaFields) return []
      return Object.keys(schemaFields).map(key => {
        const f: any = (schemaFields as any)[key]
        return {
          name: f.name ?? f.jimuName ?? key,
          alias: f.alias ?? f.name ?? key,
          type: f.type ?? ''
        }
      })
    } catch (e) {
      return []
    }
  }

  // ------------------------------------------------------------ change handlers

  onMapWidgetSelected = (useMapWidgetIds: string[]): void => {
    this.props.onSettingChange({ id: this.props.id, useMapWidgetIds })
  }

  updateConfig = (key: string, value: any): void => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set(key as any, value)
    })
  }

  updateFieldMap = (mapKey: 'lineFieldMap' | 'polygonFieldMap', field: string, value: string): void => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.setIn([mapKey, field], value)
    })
  }

  onLayerSelected = (configKey: 'pointLayerDsId' | 'lineLayerDsId' | 'polygonLayerDsId',
    useDataSources: UseDataSource[]): void => {
    const selected = useDataSources?.[0]
    const prevDsId = this.props.config[configKey]
    let all = (this.props.useDataSources ?? Immutable([])).asMutable({ deep: true }) as UseDataSource[]
    all = all.filter(ds => ds.dataSourceId !== prevDsId)
    if (selected) all.push(selected)
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.set(configKey, selected?.dataSourceId ?? ''),
      useDataSources: all
    })
    // Doc parity: choosing the Polygon layer auto-selects the related Line (and
    // Point) layers from the same service when those slots are still empty.
    if (configKey === 'polygonLayerDsId' && selected) {
      void this.autoDetectRelatedLayers(selected, all)
    }
  }

  async autoDetectRelatedLayers (polygonUds: UseDataSource, currentAll: UseDataSource[]): Promise<void> {
    try {
      const polyDs = await this.getDs(polygonUds.dataSourceId)
      const parent = polyDs?.parentDataSource
      const siblings: any[] = parent?.getChildDataSources?.() ?? []
      if (!siblings.length) return

      const geometryOf = (ds: any): string =>
        ds?.getGeometryType?.() ?? ds?.getDataSourceJson?.()?.geometryType ?? ''

      const makeUds = (ds: any): UseDataSource => ({
        dataSourceId: ds.id,
        mainDataSourceId: ds.getMainDataSource?.()?.id ?? ds.id,
        rootDataSourceId: ds.getRootDataSource?.()?.id ?? (polygonUds as any).rootDataSourceId
      } as any)

      let config = this.props.config
      const all = [...currentAll]
      let changed = false

      if (!config.lineLayerDsId) {
        const lineDs = siblings.find(sib => sib.id !== polyDs.id &&
          String(geometryOf(sib)).toLowerCase().includes('polyline'))
        if (lineDs) {
          config = config.set('lineLayerDsId', lineDs.id)
          all.push(makeUds(lineDs))
          changed = true
        }
      }
      if (!config.pointLayerDsId) {
        const pointDs = siblings.find(sib => sib.id !== polyDs.id &&
          String(geometryOf(sib)).toLowerCase().endsWith('point'))
        if (pointDs) {
          config = config.set('pointLayerDsId', pointDs.id)
          all.push(makeUds(pointDs))
          changed = true
        }
      }
      if (changed) {
        this.props.onSettingChange({ id: this.props.id, config, useDataSources: all })
      }
    } catch (e) {
      // best-effort convenience only - manual selection always works
    }
  }

  onDefaultLineTypeChange = (type: number): void => {
    const lineTypes = (this.props.config.lineTypes as any).asMutable({ deep: true })
    lineTypes.forEach((lt: any) => { lt.isDefault = lt.type === type })
    this.updateConfig('lineTypes', lineTypes)
  }

  onAttributeModeChange = (mode: string): void => {
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.setIn(['polygonAttributes', 'mode'], mode)
    })
  }

  onAttributeFieldToggle = (fieldName: string, checked: boolean): void => {
    const current: any[] = (this.props.config.polygonAttributes.fields as any)
      .asMutable({ deep: true })
    const next = checked
      ? [...current, { name: fieldName, alias: '' }]
      : current.filter(f => f.name !== fieldName)
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.setIn(['polygonAttributes', 'fields'], next)
    })
  }

  onAttributeAliasChange = (fieldName: string, alias: string): void => {
    const current: any[] = (this.props.config.polygonAttributes.fields as any)
      .asMutable({ deep: true })
    const next = current.map(f => f.name === fieldName ? { ...f, alias } : f)
    this.props.onSettingChange({
      id: this.props.id,
      config: this.props.config.setIn(['polygonAttributes', 'fields'], next)
    })
  }

  // ------------------------------------------------------------ render helpers

  /** Builder/Calcite label convention: visible label text + focusable info-icon
   *  button carrying the Tooltip (keyboard-reachable, dismissible on Escape). */
  labelWithTip (label: string, tip: string): React.ReactElement {
    return (
      <span className='pd-label-with-tip'>
        <span className='pd-label-text'>{label}</span>
        <Tooltip title={tip}>
          <Button icon type='tertiary' size='sm' className='pd-info-btn'
            aria-label={`${label}. ${tip}`}>
            <InfoOutlined size={14} />
          </Button>
        </Tooltip>
      </span>
    )
  }

  /** Calcite-style inline info notice. */
  infoNote (text: string): React.ReactElement {
    return (
      <div className='pd-note' role='note'>
        <InfoOutlined size={14} />
        <span>{text}</span>
      </div>
    )
  }

  renderLayerSelector (labelKey: string, tipKey: string,
    configKey: 'pointLayerDsId' | 'lineLayerDsId' | 'polygonLayerDsId',
    types: any): React.ReactElement {
    const dsId = this.props.config[configKey]
    const label = this.nls(labelKey)
    const tip = this.nls(tipKey)
    const selected = (this.props.useDataSources ?? Immutable([]))
      .filter((ds: any) => ds.dataSourceId === dsId)
    return (
      <SettingRow flow='wrap' label={this.labelWithTip(label, tip)}>
        <div role='group' aria-label={label} style={{ width: '100%' }}>
          <DataSourceSelector
            types={types}
            useDataSources={selected as any}
            mustUseDataSource
            onChange={ds => this.onLayerSelected(configKey, ds as any)}
            widgetId={this.props.id}
            hideDataView
          />
        </div>
      </SettingRow>
    )
  }

  /** COGO field mapping input: dropdown of the layer's real fields when the schema
   *  is available, free-text fallback otherwise (doc parity: pick fields to store
   *  COGO values). An empty choice is allowed - unmapped fields are skipped. */
  renderFieldInput (mapKey: 'lineFieldMap' | 'polygonFieldMap', field: string,
    value: string, layerDsId: string): React.ReactElement {
    const label = this.nls('settingField_' + field)
    const tip = this.nls('settingField_' + field + '_tip')
    const inputId = `pd-setting-${mapKey}-${field}`
    const fields = this.state.fieldsByDs[layerDsId]
    return (
      <SettingRow flow='wrap' key={field} label={this.labelWithTip(label, tip)}>
        {fields && fields.length > 0
          ? (
            <Select size='sm' id={inputId} value={value} aria-label={label}
              onChange={evt => this.updateFieldMap(mapKey, field, evt.target.value)}>
              <Option value=''>-</Option>
              {/* keep a configured value selectable even if it's not on the layer */}
              {value && !fields.some(f => f.name === value) && (
                <Option value={value}>{value}</Option>
              )}
              {fields.map(f => (
                <Option key={f.name} value={f.name}>{f.alias || f.name}</Option>
              ))}
            </Select>
            )
          : (
            <TextInput size='sm' id={inputId} value={value}
              aria-label={label}
              placeholder={this.nls('fieldPickerFreeText')}
              onChange={evt => this.updateFieldMap(mapKey, field, evt.target.value)} />
            )}
      </SettingRow>
    )
  }

  /** Radio group per the builder convention for mutually exclusive modes. */
  renderAttributeModeRadios (mode: string): React.ReactElement {
    const options: Array<[string, string]> = [
      ['legacy', this.nls('attributeModeLegacy')],
      ['popup', this.nls('attributeModePopup')],
      ['custom', this.nls('attributeModeCustom')]
    ]
    return (
      <div role='radiogroup' aria-label={this.nls('settingAttributeMode')} style={{ width: '100%' }}>
        {options.map(([value, text]) => (
          <Label key={value} className='pd-radio-item' check>
            <Radio
              name='pd-attribute-mode'
              checked={mode === value}
              aria-label={text}
              onChange={() => this.onAttributeModeChange(value)}
            />
            {text}
          </Label>
        ))}
      </div>
    )
  }

  renderAttributeSettings (): React.ReactElement {
    const config = this.props.config
    const mode = config.polygonAttributes?.mode ?? 'legacy'
    const polyDsId = config.polygonLayerDsId
    const fields = this.state.fieldsByDs[polyDsId] ?? []
    const configured: any[] = config.polygonAttributes?.fields
      ? (config.polygonAttributes.fields as any).asMutable({ deep: true })
      : []
    const configuredByName: { [name: string]: any } = {}
    configured.forEach(f => { configuredByName[f.name] = f })

    return (
      <SettingSection title={this.nls('settingAttributes')}>
        <SettingRow flow='wrap'
          label={this.labelWithTip(this.nls('settingAttributeMode'), this.nls('settingAttributeModeTip'))}>
          {this.renderAttributeModeRadios(mode)}
        </SettingRow>

        {mode === 'custom' && (
          <SettingRow flow='wrap' label={this.nls('attributeFieldsHeader')}>
            {!polyDsId && this.infoNote(this.nls('attributeNoPolygonLayer'))}
            {polyDsId && fields.length === 0 && this.infoNote(this.nls('loadingFields'))}
            <div role='group' aria-label={this.nls('attributeFieldsHeader')} style={{ width: '100%' }}>
              {fields.map(f => {
                const entry = configuredByName[f.name]
                const checked = !!entry
                return (
                  <div className='pd-attr-field-row' key={f.name}>
                    <Checkbox checked={checked}
                      aria-label={`${f.alias || f.name}`}
                      onChange={(_evt, chk) => this.onAttributeFieldToggle(f.name, chk)} />
                    <span className='pd-attr-name' title={f.name}>{f.alias || f.name}</span>
                    {checked && (
                      <TextInput size='sm' className='pd-attr-alias'
                        value={entry.alias ?? ''}
                        placeholder={this.nls('attributeAliasPlaceholder')}
                        aria-label={`${this.nls('attributeAliasPlaceholder')}: ${f.name}`}
                        onChange={evt => this.onAttributeAliasChange(f.name, evt.target.value)} />
                    )}
                  </div>
                )
              })}
            </div>
          </SettingRow>
        )}
      </SettingSection>
    )
  }

  // ------------------------------------------------------------ render

  render (): React.ReactElement {
    const config = this.props.config
    const lineFM = config.lineFieldMap
    const polyFM = config.polygonFieldMap
    const featureTypes = Immutable([AllDataSourceTypes.FeatureLayer])
    const lineTypes: any[] = (config.lineTypes as any).asMutable
      ? (config.lineTypes as any).asMutable({ deep: true })
      : (config.lineTypes as any)
    const defaultLineType = lineTypes.find(lt => lt.isDefault)?.type ?? lineTypes[0]?.type

    return (
      <div css={style} className='widget-setting-parcel-drafter'>
        <SettingSection title={this.nls('settingSelectMap')}>
          <SettingRow>
            <div role='group' aria-label={this.nls('settingSelectMap')} style={{ width: '100%' }}>
              <MapWidgetSelector useMapWidgetIds={this.props.useMapWidgetIds}
                onSelect={this.onMapWidgetSelected} />
            </div>
          </SettingRow>
        </SettingSection>

        <SettingSection title={this.nls('settingLayers')}>
          {this.renderLayerSelector('settingPolygonLayer', 'settingPolygonLayerTip', 'polygonLayerDsId', featureTypes)}
          {this.infoNote(this.nls('relatedLayersDetected'))}
          {this.renderLayerSelector('settingLineLayer', 'settingLineLayerTip', 'lineLayerDsId', featureTypes)}
          {this.renderLayerSelector('settingPointLayer', 'settingPointLayerTip', 'pointLayerDsId', featureTypes)}
          <SettingRow flow='wrap'
            label={this.labelWithTip(this.nls('settingDefaultLineType'), this.nls('settingDefaultLineTypeTip'))}>
            <Select size='sm' id='pd-setting-default-line-type' value={defaultLineType}
              aria-label={this.nls('settingDefaultLineType')}
              onChange={evt => this.onDefaultLineTypeChange(Number(evt.target.value))}>
              {lineTypes.map(lt => (
                <Option key={lt.type} value={lt.type}>{lt.label}</Option>
              ))}
            </Select>
          </SettingRow>
        </SettingSection>

        <SettingSection title={this.nls('settingLineFields')}>
          {this.infoNote(this.nls('fieldMissingNote'))}
          {(['bearing', 'distance', 'radius', 'arcLength', 'lineType'] as const).map(f =>
            this.renderFieldInput('lineFieldMap', f, lineFM[f], config.lineLayerDsId))}
        </SettingSection>

        <SettingSection title={this.nls('settingPolygonFields')}>
          {this.infoNote(this.nls('fieldMissingNote'))}
          {(['name', 'description', 'statedArea', 'miscloseRatio', 'miscloseDistance', 'rotation', 'scale'] as const).map(f =>
            this.renderFieldInput('polygonFieldMap', f, polyFM[f], config.polygonLayerDsId))}
        </SettingSection>

        {this.renderAttributeSettings()}

        <SettingSection title={this.nls('settingLabels')}>
          <SettingRow flow='wrap'
            label={this.labelWithTip(this.nls('settingLabelPlacement'), this.nls('settingLabelPlacementTip'))}>
            <Select size='sm' id='pd-setting-label-placement'
              value={config.labelPlacement ?? 'beside'}
              aria-label={this.nls('settingLabelPlacement')}
              onChange={evt => this.updateConfig('labelPlacement', evt.target.value)}>
              <Option value='beside'>{this.nls('settingLabelPlacementBeside')}</Option>
              <Option value='on'>{this.nls('settingLabelPlacementOn')}</Option>
            </Select>
          </SettingRow>
          <SettingRow flow='wrap'
            label={this.labelWithTip(this.nls('settingLabelOffset'), this.nls('settingLabelOffsetTip'))}>
            <NumericInput size='sm' id='pd-setting-label-offset'
              value={config.labelOffset ?? 10}
              aria-label={this.nls('settingLabelOffset')}
              onChange={v => this.updateConfig('labelOffset', v ?? 0)} />
          </SettingRow>
        </SettingSection>

        <SettingSection title={this.nls('settingMisclose')}>
          <SettingRow flow='wrap'
            label={this.labelWithTip(this.nls('settingSnapDistance'), this.nls('settingSnapDistanceTip'))}>
            <NumericInput size='sm' id='pd-setting-snap-distance'
              value={config.miscloseSnapDistance} min={0}
              aria-label={this.nls('settingSnapDistance')}
              onChange={v => this.updateConfig('miscloseSnapDistance', v ?? 0)} />
          </SettingRow>
          <SettingRow flow='wrap'
            label={this.labelWithTip(this.nls('settingSnapDistanceUnit'), this.nls('settingSnapDistanceUnitTip'))}>
            <Select size='sm' id='pd-setting-snap-unit'
              value={config.miscloseSnapDistanceUnit}
              aria-label={this.nls('settingSnapDistanceUnit')}
              onChange={evt => this.updateConfig('miscloseSnapDistanceUnit', evt.target.value)}>
              <Option value='feet'>{this.nls('feet')}</Option>
              <Option value='meters'>{this.nls('meters')}</Option>
              <Option value='uSSurveyFeet'>{this.nls('uSSurveyFeet')}</Option>
            </Select>
          </SettingRow>
          <SettingRow flow='wrap'
            label={this.labelWithTip(this.nls('settingRatioSnap'), this.nls('settingRatioSnapTip'))}>
            <NumericInput size='sm' id='pd-setting-ratio-snap'
              value={config.miscloseRatioSnap} min={0}
              aria-label={this.nls('settingRatioSnap')}
              onChange={v => this.updateConfig('miscloseRatioSnap', v ?? 0)} />
          </SettingRow>
          <SettingRow flow='wrap'
            label={this.labelWithTip(this.nls('settingSnappingTolerance'), this.nls('settingSnappingToleranceTip'))}>
            <NumericInput size='sm' id='pd-setting-snapping-tolerance'
              value={config.snappingTolerance} min={0}
              aria-label={this.nls('settingSnappingTolerance')}
              onChange={v => this.updateConfig('snappingTolerance', v ?? 0)} />
          </SettingRow>
        </SettingSection>
      </div>
    )
  }
}
