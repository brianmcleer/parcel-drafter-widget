/** Parcel tools (rotation / scale) - React replacement for ParcelTools.html/js.
 *  Accessibility: inputs labelled via htmlFor/id + tooltips, anchor toggle exposes
 *  aria-pressed, group is named (WCAG 1.3.1, 3.3.2, 4.1.2). */
/** @jsx jsx */
import { React, jsx, css } from 'jimu-core'
import { TextInput, Label, Button, Tooltip } from 'jimu-ui'
import { LabelWithTip } from './ui-helpers'

interface Props {
  rotation: number
  scale: number
  updateRotationActive: boolean
  dragMode: 'none' | 'rotate' | 'scale'
  onRotationChange: (rotation: number) => void
  onScaleChange: (scale: number) => void
  onToggleUpdateRotationPoint: () => void
  onToggleDragMode: (mode: 'rotate' | 'scale') => void
  strings: any
}

/* Two rows, not one: the inputs and the three toggle buttons on a single flex
   row pushed the buttons past the panel edge, because the inputs keep their
   intrinsic width and nothing wrapped. Inputs share the first row and shrink;
   the buttons sit on their own wrapping row underneath. */
const style = css`
  margin-top: 8px;
  .pd-tool-row {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  .pd-tool { flex: 1 1 0; min-width: 0; }
  .pd-tool input { width: 100%; min-width: 0; }
  .pd-tool label { font-size: 12px; font-weight: 600; display: block; margin-bottom: 2px; }
  .pd-tool-buttons {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-top: 6px;
  }
  :focus-visible {
    outline: 2px solid var(--sys-color-primary-main, #076fe5);
    outline-offset: 1px;
  }
`

export function ParcelTools (props: Props): React.ReactElement {
  const { rotation, scale, strings } = props
  const [rotationText, setRotationText] = React.useState(String(rotation))
  const [scaleText, setScaleText] = React.useState(String(scale))

  React.useEffect(() => { setRotationText(rotation.toFixed(2)) }, [rotation])
  React.useEffect(() => { setScaleText(scale.toFixed(4)) }, [scale])

  const commitRotation = (): void => {
    const v = parseFloat(rotationText)
    if (!isNaN(v)) props.onRotationChange(((v % 360) + 360) % 360)
    else setRotationText(rotation.toFixed(2))
  }

  const commitScale = (): void => {
    const v = parseFloat(scaleText)
    if (!isNaN(v) && v > 0) props.onScaleChange(v)
    else setScaleText(scale.toFixed(4))
  }

  return (
    <div css={style} role='group' aria-label={strings.parcelToolsLabel}>
      <div className='pd-tool-row'>
      <div className='pd-tool'>
        <Label for='pd-tool-rotation'>
          <LabelWithTip label={strings.rotation} tip={strings.rotationTip} />
        </Label>
        <TextInput size='sm' id='pd-tool-rotation' value={rotationText}
          aria-label={strings.rotation}
          onChange={evt => setRotationText(evt.target.value)}
          onBlur={commitRotation}
          onKeyDown={evt => { if (evt.key === 'Enter') commitRotation() }} />
      </div>
      <div className='pd-tool'>
        <Label for='pd-tool-scale'>
          <LabelWithTip label={strings.scale} tip={strings.scaleTip} />
        </Label>
        <TextInput size='sm' id='pd-tool-scale' value={scaleText}
          aria-label={strings.scale}
          onChange={evt => setScaleText(evt.target.value)}
          onBlur={commitScale}
          onKeyDown={evt => { if (evt.key === 'Enter') commitScale() }} />
      </div>
      </div>
      <div className='pd-tool-buttons'>
      <Tooltip title={strings.anchorTip}>
        <Button size='sm' type={props.updateRotationActive ? 'primary' : 'secondary'}
          aria-label={strings.updateRotationPoint}
          aria-pressed={props.updateRotationActive}
          onClick={props.onToggleUpdateRotationPoint}>
          {strings.rotationPointShort}
        </Button>
      </Tooltip>
      <Tooltip title={strings.dragRotateTip}>
        <Button size='sm' type={props.dragMode === 'rotate' ? 'primary' : 'secondary'}
          aria-label={strings.dragRotate}
          aria-pressed={props.dragMode === 'rotate'}
          onClick={() => props.onToggleDragMode('rotate')}>
          {strings.dragRotateShort}
        </Button>
      </Tooltip>
      <Tooltip title={strings.dragScaleTip}>
        <Button size='sm' type={props.dragMode === 'scale' ? 'primary' : 'secondary'}
          aria-label={strings.dragScale}
          aria-pressed={props.dragMode === 'scale'}
          onClick={() => props.onToggleDragMode('scale')}>
          {strings.dragScaleShort}
        </Button>
      </Tooltip>
      </div>
    </div>
  )
}
