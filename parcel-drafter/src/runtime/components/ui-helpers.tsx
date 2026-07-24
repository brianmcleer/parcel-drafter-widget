/** Shared Calcite-convention UI primitives for the runtime widget, built on
 *  jimu-ui with the Calcite-aligned jimu theme tokens. Mirrors the patterns used
 *  in the settings panel: label + focusable info-icon Tooltip, and inline notices. */
/** @jsx jsx */
import { React, jsx, css } from 'jimu-core'
import { Tooltip, Button } from 'jimu-ui'
import { InfoOutlined } from 'jimu-icons/outlined/suggested/info'

const labelStyle = css`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  .pd-label-text {
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
`

const noteStyle = css`
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
  .jimu-icon { flex: none; margin-top: 1px; }
`

/** Label text with a focusable info-icon Tooltip (Calcite/builder convention). */
export function LabelWithTip (props: { label: React.ReactNode, tip: string, ariaLabel?: string }): React.ReactElement {
  return (
    <span css={labelStyle}>
      <span className='pd-label-text'>{props.label}</span>
      <Tooltip title={props.tip}>
        <Button icon type='tertiary' size='sm' className='pd-info-btn'
          aria-label={props.ariaLabel ?? `${String(props.label)}. ${props.tip}`}>
          <InfoOutlined size={14} />
        </Button>
      </Tooltip>
    </span>
  )
}

/** Calcite-style inline info notice (icon + tinted panel + info accent border). */
export function InfoNote (props: { children?: React.ReactNode, role?: string }): React.ReactElement {
  return (
    <div css={noteStyle} role={props.role ?? 'note'}>
      <InfoOutlined size={14} />
      <span>{props.children}</span>
    </div>
  )
}
