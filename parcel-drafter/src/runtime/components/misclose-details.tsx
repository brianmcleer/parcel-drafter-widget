/** Misclose details panel - React replacement for MiscloseDetails.html/js.
 *  Accessibility: named region with polite live announcements when misclose
 *  values change; accuracy is conveyed by text, not color alone
 *  (WCAG 1.4.1, 4.1.3). */
/** @jsx jsx */
import { React, jsx, css } from 'jimu-core'
import { LabelWithTip } from './ui-helpers'
import { type MiscloseDetails } from '../lib/traverse-engine'
import { type PlanSettings, getBearingForPlanSettings } from '../lib/bearing-utils'
import { getAbbreviatedUnits, metersToFeet, metersToUSSurveyFeet } from '../lib/unit-utils'

interface Props {
  details: MiscloseDetails | null
  planSettings: PlanSettings
  strings: any
}

const style = css`
  background: var(--sys-color-surface-paper, #f4f4f4);
  border: 1px solid var(--sys-color-divider-secondary, #ddd);
  border-radius: 4px;
  padding: 8px;
  font-size: 12px;
  margin-top: 8px;
  .pd-misclose-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }
  .pd-misclose-row > span:last-of-type { text-align: right; }
  .pd-misclose-label { font-weight: 600; }
  .pd-adjusted {
    color: var(--sys-color-success-main, #338033);
    font-weight: 600;
  }
  .pd-accuracy-high { color: var(--sys-color-success-main, #338033); }
`

export function MiscloseDetailsPanel (props: Props): React.ReactElement | null {
  const { details, planSettings, strings } = props
  if (!details) return null

  const unit = planSettings.distanceAndLengthUnits
  const distMeters = details.miscloseDistanceMeters
  const dist = unit === 'meters' ? distMeters : unit === 'feet' ? metersToFeet(distMeters) : metersToUSSurveyFeet(distMeters)

  const area = details.areaConversions ? details.areaConversions[planSettings.areaUnits] : 0
  const bearingText = details.bearingConversions
    ? getBearingForPlanSettings(details.bearingConversions, planSettings)
    : '0'

  return (
    <div css={style} role='region' aria-label={strings.miscloseRegionLabel} aria-live='polite'>
      <div className='pd-misclose-row'>
        <span className='pd-misclose-label'>
          <LabelWithTip label={strings.miscloseBearing} tip={strings.miscloseBearingTip} />
        </span>
        <span>{bearingText}</span>
      </div>
      <div className='pd-misclose-row'>
        <span className='pd-misclose-label'>
          <LabelWithTip label={strings.miscloseDistance} tip={strings.miscloseDistanceTip} />
        </span>
        <span>{dist.toFixed(2)} {getAbbreviatedUnits(unit)}</span>
      </div>
      <div className='pd-misclose-row'>
        <span className='pd-misclose-label'>
          <LabelWithTip label={strings.miscloseRatio} tip={strings.miscloseRatioTip} />
        </span>
        <span className={details.accuracy ? 'pd-accuracy-high' : ''}>
          {details.accuracy ? strings.highAccuracy : String(details.miscloseRatio || '-')}
        </span>
      </div>
      <div className='pd-misclose-row'>
        <span className='pd-misclose-label'>
          <LabelWithTip label={strings.calculatedArea} tip={strings.calculatedAreaTip} />
        </span>
        <span>{Number(area).toFixed(2)} {getAbbreviatedUnits(planSettings.areaUnits)}</span>
      </div>
      {details.adjustPoints && (
        <div className='pd-adjusted' role='status'>
          <LabelWithTip label={strings.compassRuleApplied} tip={strings.compassRuleTip} />
        </div>
      )}
    </div>
  )
}
