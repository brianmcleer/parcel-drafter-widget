/** First-run hint banner (handoff Section 10.5, verbatim markup): tinted background,
 *  3px accent bar, lightbulb, bold lead-in, one sentence, an inline underlined link
 *  into the guide, and an icon-only x dismiss. A function component so it can call
 *  useTokens(); the class widget renders it instead of reimplementing the tokens. */
import { React } from 'jimu-core'
import { Button } from 'jimu-ui'
import { CalciteIcon } from 'calcite-components'
import { useTokens } from '../theme'

export interface FirstRunHintProps {
  title: string
  body: string
  helpLink: string
  dismissLabel: string
  onOpenHelp: () => void
  onDismiss: () => void
}

const FirstRunHint: React.FC<FirstRunHintProps> = ({ title, body, helpLink, dismissLabel, onOpenHelp, onDismiss }) => {
  const tokens = useTokens()
  return (
    <div role="note" style={{ margin: '0 0 10px 0', padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: '10px', background: tokens.infoBg, color: tokens.text, border: `1px solid ${tokens.divider}`, borderLeft: `3px solid ${tokens.primary}`, borderRadius: tokens.radius, fontSize: '12px', lineHeight: 1.5 }}>
      <span style={{ color: tokens.primary, marginTop: '1px' }} aria-hidden="true"><CalciteIcon icon="lightbulb" scale="s" /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', marginBottom: '2px' }}>{title}</strong>
        {body}
        {' '}
        <button type="button" onClick={onOpenHelp} style={{ border: 'none', background: 'transparent', padding: 0, color: tokens.primary, cursor: 'pointer', textDecoration: 'underline', font: 'inherit' }}>{helpLink}</button>
      </span>
      <Button size="sm" type="tertiary" icon onClick={onDismiss} title={dismissLabel} aria-label={dismissLabel}>
        <CalciteIcon icon="x" scale="s" />
      </Button>
    </div>
  )
}

export default FirstRunHint
