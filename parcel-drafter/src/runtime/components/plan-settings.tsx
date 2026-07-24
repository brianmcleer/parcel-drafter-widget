/** Plan settings panel - React replacement for PlanSettings.html/js.
 *  Accessibility: each Select is programmatically labelled (htmlFor/id plus
 *  aria-label as a fallback) and the panel is a named group (WCAG 1.3.1, 4.1.2). */
/** @jsx jsx */
import { React, jsx, css } from 'jimu-core'
import { Select, Option, Label } from 'jimu-ui'
import { LabelWithTip } from './ui-helpers'
import { type PlanSettings } from '../lib/bearing-utils'

interface Props {
  planSettings: PlanSettings
  onChange: (updated: PlanSettings) => void
  strings: any
}

const style = css`
  .pd-setting-row {
    margin-bottom: 10px;
  }
  .pd-setting-row label {
    font-size: 12px;
    font-weight: 600;
    display: block;
    margin-bottom: 2px;
  }
  :focus-visible {
    outline: 2px solid var(--sys-color-primary-main, #076fe5);
    outline-offset: 1px;
  }
`

export function PlanSettingsPanel (props: Props): React.ReactElement {
  const { planSettings, onChange, strings } = props
  const update = (patch: Partial<PlanSettings>): void => {
    onChange({ ...planSettings, ...patch })
  }

  const row = (
    id: string, label: string, tip: string, value: string, options: Array<[string, string]>,
    onSelect: (value: string) => void
  ): React.ReactElement => (
    <div className='pd-setting-row'>
      <Label for={id}>
        <LabelWithTip label={label} tip={tip} />
      </Label>
      <Select size='sm' id={id} value={value} aria-label={label}
        onChange={evt => onSelect(evt.target.value)}>
        {options.map(([v, text]) => <Option key={v} value={v}>{text}</Option>)}
      </Select>
    </div>
  )

  return (
    <div css={style} role='group' aria-label={strings.planSettingsLabel}>
      {row('pd-ps-direction-type', strings.directionOrAngleType, strings.directionOrAngleTypeTip, planSettings.directionOrAngleType, [
        ['northAzimuth', strings.northAzimuth],
        ['southAzimuth', strings.southAzimuth],
        ['quadrantBearing', strings.quadrantBearing]
      ], v => update({ directionOrAngleType: v as any }))}

      {row('pd-ps-direction-units', strings.directionOrAngleUnits, strings.directionOrAngleUnitsTip, planSettings.directionOrAngleUnits, [
        ['decimalDegree', strings.decimalDegree],
        ['degreeMinuteSeconds', strings.degreeMinuteSeconds]
      ], v => update({ directionOrAngleUnits: v as any }))}

      {row('pd-ps-length-units', strings.distanceAndLengthUnits, strings.distanceAndLengthUnitsTip, planSettings.distanceAndLengthUnits, [
        ['meters', strings.meters],
        ['feet', strings.feet],
        ['uSSurveyFeet', strings.uSSurveyFeet]
      ], v => update({ distanceAndLengthUnits: v as any }))}

      {row('pd-ps-area-units', strings.areaUnits, strings.areaUnitsTip, planSettings.areaUnits, [
        ['acres', strings.acres],
        ['squareMeters', strings.squareMeters],
        ['squareFeet', strings.squareFeet],
        ['squareUSSurveyFeet', strings.squareUSSurveyFeet]
      ], v => update({ areaUnits: v as any }))}

      {row('pd-ps-curve-params', strings.circularCurveParameters, strings.circularCurveParametersTip, planSettings.circularCurveParameters, [
        ['radiusAndChordLength', strings.radiusAndChordLength],
        ['radiusAndArcLength', strings.radiusAndArcLength]
      ], v => update({ circularCurveParameters: v as any }))}
    </div>
  )
}
