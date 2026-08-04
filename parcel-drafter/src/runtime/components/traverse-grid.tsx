/** Traverse entry grid - React replacement for the dijit grid in NewTraverse.html/js.
 *  Accessibility: exposed as a table (role=table/row/columnheader/cell), every input
 *  has an accessible name including its line number, validation errors are announced
 *  via role=alert and linked with aria-describedby/aria-invalid (WCAG 1.3.1, 3.3.1,
 *  3.3.2, 4.1.2). Entry-format tooltips are provided on the entry inputs. */
/** @jsx jsx */
import { React, jsx, css } from 'jimu-core'
import { TextInput, Select, Option, Button } from 'jimu-ui'
import { TrashOutlined } from 'jimu-icons/outlined/editor/trash'
import { type TraverseItem } from '../lib/traverse-engine'
import { type PlanSettings, getBearingForPlanSettings } from '../lib/bearing-utils'
import { type LineTypeConfig } from '../../config'
import { type LengthUnit } from '../lib/unit-utils'
import { chordBearingToTangentBearing } from '../lib/geometry-utils'
import { LabelWithTip } from './ui-helpers'

interface Props {
  items: TraverseItem[]
  lineTypes: LineTypeConfig[]
  planSettings: PlanSettings
  onAddItem: (bearing: string, distance: string, radius: string, lineType: number, bearingNaDDOverride?: number) => string | null
  onUpdateItem: (index: number, field: 'bearing' | 'distance' | 'radius', value: string) => string | null
  onChangeLineType: (index: number, lineType: number) => void
  onDeleteItem: (index: number) => void
  onReorder: (from: number, to: number) => void
  strings: any
}

const gridStyle = css`
  .pd-grid-header, .pd-grid-row {
    display: grid;
    grid-template-columns: 20px 2fr 1.6fr 1.3fr 1.6fr 34px;
    gap: 4px;
    align-items: center;
    margin-bottom: 4px;
  }
  .pd-grid-header {
    font-weight: 600;
    font-size: 12px;
  }
  .pd-error {
    color: var(--sys-color-error-main, #d9364c);
    font-size: 12px;
    margin: 2px 0 6px 0;
  }
  .pd-drag-handle {
    cursor: grab;
    background: none;
    border: none;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    color: var(--sys-color-surface-paper-text, #6a6a6a);
  }
  .pd-grid-row.pd-drop-target {
    outline: 2px dashed var(--sys-color-primary-main, #076fe5);
    outline-offset: 1px;
  }
  .pd-grid-row :focus-visible, .pd-grid-header :focus-visible {
    outline: 2px solid var(--sys-color-primary-main, #076fe5);
    outline-offset: 1px;
  }
`

const ERROR_ID = 'pd-grid-error'

export function TraverseGrid (props: Props): React.ReactElement {
  const { items, lineTypes, planSettings, strings } = props
  const defaultType = lineTypes.find(lt => lt.isDefault) ?? lineTypes[0]

  const [bearing, setBearing] = React.useState('')
  const [distance, setDistance] = React.useState('')
  const [radius, setRadius] = React.useState('')
  const [lineType, setLineType] = React.useState<number>(defaultType?.type ?? 0)
  const [error, setError] = React.useState<string | null>(null)
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)
  const [dropIndex, setDropIndex] = React.useState<number | null>(null)

  const unit: LengthUnit = planSettings.distanceAndLengthUnits
  const lineNo = (index: number): string =>
    String(strings.lineNumber).replace('{number}', String(index + 1))

  const tryAdd = (): void => {
    // "*" copies previous row's value; "*tb" continues tangent to the previous
    // line/curve - same shortcuts as WAB
    const prev = items[items.length - 1]
    let b = bearing.trim() === '*' && prev ? prev.bearing : bearing
    let naDDOverride: number | undefined
    if (bearing.trim().toLowerCase() === '*tb' && prev) {
      if (prev.radiusConversions && prev.chordLengthConversions) {
        // tangent bearing at the end of the previous curve
        naDDOverride = chordBearingToTangentBearing(
          prev.bearingConversions.naDD,
          prev.radiusConversions.meters,
          prev.chordLengthConversions.meters)
      } else {
        // previous line is straight: tangent equals its bearing
        naDDOverride = prev.bearingConversions.naDD
      }
      b = bearing.trim()
    }
    const d = distance.trim() === '*' && prev ? prev.distance : distance
    const r = radius.trim() === '*' && prev ? prev.radius : radius
    const err = props.onAddItem(b.trim(), d.trim(), r.trim(), lineType, naDDOverride)
    if (err) {
      setError(err)
    } else {
      setError(null)
      setBearing('')
      setDistance('')
      setRadius('')
    }
  }

  const bearingCellRef = React.useRef<HTMLDivElement>(null)
  const distanceCellRef = React.useRef<HTMLDivElement>(null)
  const radiusCellRef = React.useRef<HTMLDivElement>(null)

  const focusCell = (ref: React.RefObject<HTMLDivElement>): void => {
    const el = ref.current?.querySelector('input')
    if (el) { el.focus(); el.select() }
  }

  /** 10-key entry flow (ported from the Polk County traverse widget):
   *  numpad + or numpad Enter advances bearing -> length and commits from
   *  length or radius, returning focus to bearing for the next call.
   *  numpad / jumps from length to radius for curve entry.
   *  The right hand never has to leave the numpad. */
  const onEntryKeyDown = (evt: React.KeyboardEvent, field: 'bearing' | 'distance' | 'radius'): void => {
    const isNumpadEnter = (evt as any).code === 'NumpadEnter'
    const isNumpadPlus = (evt as any).code === 'NumpadAdd'
    const isNumpadDivide = (evt as any).code === 'NumpadDivide'

    if ((isNumpadEnter || isNumpadPlus) && field === 'bearing') {
      evt.preventDefault()
      focusCell(distanceCellRef)
      return
    }
    if (isNumpadDivide && field === 'distance') {
      evt.preventDefault()
      focusCell(radiusCellRef)
      return
    }
    if ((isNumpadEnter || isNumpadPlus) && (field === 'distance' || field === 'radius')) {
      evt.preventDefault()
      tryAdd()
      focusCell(bearingCellRef)
      return
    }
    if (evt.key === 'Enter') {
      tryAdd()
      focusCell(bearingCellRef)
    }
  }

  const displayLength = (item: TraverseItem): string => {
    const c = item.lengthConversions
    if (!c) return ''
    return unit === 'meters' ? c.metersRound : unit === 'feet' ? c.feetRound : c.uSSurveyFeetRound
  }

  const displayRadius = (item: TraverseItem): string => {
    const c = item.radiusConversions
    if (!c) return ''
    return unit === 'meters' ? c.metersRound : unit === 'feet' ? c.feetRound : c.uSSurveyFeetRound
  }

  const describedBy = error ? ERROR_ID : undefined

  const moveRow = (from: number, to: number): void => {
    if (to < 0 || to >= items.length || from === to) return
    props.onReorder(from, to)
  }

  const onHandleKeyDown = (evt: React.KeyboardEvent, index: number): void => {
    if (evt.key === 'ArrowUp') {
      evt.preventDefault()
      moveRow(index, index - 1)
    } else if (evt.key === 'ArrowDown') {
      evt.preventDefault()
      moveRow(index, index + 1)
    }
  }

  return (
    <div css={gridStyle} role='table' aria-label={strings.traverseGridLabel}>
      <div className='pd-grid-header' role='row'>
        <div role='columnheader'><span className='sr-only'>{strings.reorder}</span></div>
        <div role='columnheader'><LabelWithTip label={strings.bearing} tip={strings.bearingEntryTip} /></div>
        <div role='columnheader'>
          {planSettings.circularCurveParameters === 'radiusAndArcLength' ? strings.arcLength : strings.length}
        </div>
        <div role='columnheader'>{strings.radius}</div>
        <div role='columnheader'><LabelWithTip label={strings.lineType} tip={strings.lineTypeTip} /></div>
        <div role='columnheader'>
          <span className='sr-only'>{strings.deleteLine}</span>
        </div>
      </div>

      {items.map((item, index) => (
        <div
          className={'pd-grid-row' + (dropIndex === index ? ' pd-drop-target' : '')}
          key={index} role='row'
          onDragOver={evt => { evt.preventDefault(); setDropIndex(index) }}
          onDragLeave={() => setDropIndex(cur => (cur === index ? null : cur))}
          onDrop={evt => {
            evt.preventDefault()
            if (dragIndex !== null) moveRow(dragIndex, index)
            setDragIndex(null)
            setDropIndex(null)
          }}
        >
          <div role='cell'>
            <button
              type='button'
              className='pd-drag-handle'
              draggable
              aria-label={`${strings.reorder}, ${lineNo(index)}. ${strings.reorderTip}`}
              title={strings.reorderTip}
              onDragStart={evt => {
                setDragIndex(index)
                evt.dataTransfer.effectAllowed = 'move'
                evt.dataTransfer.setData('text/plain', String(index))
              }}
              onDragEnd={() => { setDragIndex(null); setDropIndex(null) }}
              onKeyDown={evt => onHandleKeyDown(evt, index)}
            >≡</button>
          </div>
          <div role='cell'>
            <TextInput
              size='sm'
              value={item.bearing}
              aria-label={`${strings.bearing}, ${lineNo(index)}`}
              aria-invalid={!!error || undefined}
              aria-describedby={describedBy}
              title={getBearingForPlanSettings(item.bearingConversions, planSettings)}
              onChange={evt => {
                const err = props.onUpdateItem(index, 'bearing', evt.target.value)
                setError(err)
              }}
            />
          </div>
          <div role='cell'>
            <TextInput
              size='sm'
              value={item.distance}
              aria-label={`${strings.length}, ${lineNo(index)}`}
              aria-invalid={!!error || undefined}
              aria-describedby={describedBy}
              title={displayLength(item)}
              onChange={evt => {
                const err = props.onUpdateItem(index, 'distance', evt.target.value)
                setError(err)
              }}
            />
          </div>
          <div role='cell'>
            <TextInput
              size='sm'
              value={item.radius}
              aria-label={`${strings.radius}, ${lineNo(index)}`}
              aria-invalid={!!error || undefined}
              aria-describedby={describedBy}
              title={displayRadius(item)}
              onChange={evt => {
                const err = props.onUpdateItem(index, 'radius', evt.target.value)
                setError(err)
              }}
            />
          </div>
          <div role='cell'>
            <Select
              size='sm'
              value={item.lineType}
              aria-label={`${strings.lineType}, ${lineNo(index)}`}
              title={strings.lineTypeTip}
              onChange={evt => props.onChangeLineType(index, Number(evt.target.value))}
            >
              {lineTypes.map(lt => (
                <Option key={lt.type} value={lt.type}>{lt.label}</Option>
              ))}
            </Select>
          </div>
          <div role='cell'>
            <Button size='sm' icon type='tertiary'
              title={`${strings.deleteLine}, ${lineNo(index)}`}
              aria-label={`${strings.deleteLine}, ${lineNo(index)}`}
              onClick={() => props.onDeleteItem(index)}>
              <TrashOutlined size='s' />
            </Button>
          </div>
        </div>
      ))}

      {/* entry row */}
      <div className='pd-grid-row' role='row'>
        <div role='cell' />
        <div role='cell' ref={bearingCellRef}>
          <TextInput size='sm' placeholder={strings.bearingHint} value={bearing}
            aria-label={`${strings.bearing}, ${strings.newLineEntry}`}
            aria-invalid={!!error || undefined}
            aria-describedby={describedBy}
            title={strings.bearingEntryTip}
            onChange={evt => setBearing(evt.target.value)}
            onKeyDown={evt => onEntryKeyDown(evt, 'bearing')} />
        </div>
        <div role='cell' ref={distanceCellRef}>
          <TextInput size='sm' placeholder={strings.lengthHint} value={distance}
            aria-label={`${strings.length}, ${strings.newLineEntry}`}
            aria-invalid={!!error || undefined}
            aria-describedby={describedBy}
            title={strings.lengthEntryTip}
            onChange={evt => setDistance(evt.target.value)}
            onKeyDown={evt => onEntryKeyDown(evt, 'distance')} />
        </div>
        <div role='cell' ref={radiusCellRef}>
          <TextInput size='sm' placeholder={strings.radiusHint} value={radius}
            aria-label={`${strings.radius}, ${strings.newLineEntry}`}
            aria-describedby={describedBy}
            title={strings.radiusEntryTip}
            onChange={evt => setRadius(evt.target.value)}
            onKeyDown={evt => onEntryKeyDown(evt, 'radius')} />
        </div>
        <div role='cell'>
          <Select size='sm' value={lineType}
            aria-label={`${strings.lineType}, ${strings.newLineEntry}`}
            title={strings.lineTypeTip}
            onChange={evt => setLineType(Number(evt.target.value))}>
            {lineTypes.map(lt => (
              <Option key={lt.type} value={lt.type}>{lt.label}</Option>
            ))}
          </Select>
        </div>
        <div role='cell'>
          <Button size='sm' type='primary' title={strings.addLine}
            aria-label={strings.addLine} onClick={tryAdd}>+</Button>
        </div>
      </div>

      {error && <div className='pd-error' id={ERROR_ID} role='alert'>{error}</div>}
    </div>
  )
}
