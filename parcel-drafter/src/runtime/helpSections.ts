/** Help guide content for Parcel Drafter (handoff Section 10.6 pattern).
 *  Presentation lives in components/HelpPopup.tsx (copied between widgets
 *  unchanged); this file is the only per-widget part. Every line is gated on a
 *  feature flag computed from the same config checks the save path uses, so the
 *  guide never describes a layer the app does not save to. */
import { type HelpSection } from './components/HelpPopup'

/** Flags the widget computes from config. One per optional feature with help text. */
export interface HelpFeatures {
  pointLayer: boolean
  lineLayer: boolean
  polygonLayer: boolean
}

type T = (id: string, values?: Record<string, string>) => string

export function buildHelpSections (t: T, f: HelpFeatures): HelpSection[] {
  const when = (on: boolean, ...ids: string[]): string[] => (on ? ids.map((id: string) => t(id)) : [])
  const anyLayer = f.pointLayer || f.lineLayer || f.polygonLayer

  const saveSection: HelpSection[] = anyLayer
    ? [{
        key: 'save',
        icon: 'save',
        title: t('helpSaveTitle'),
        body: [
          ...when(f.lineLayer, 'helpSaveLines'),
          ...when(f.pointLayer, 'helpSavePoints'),
          ...when(f.polygonLayer, 'helpSavePolygon'),
          ...when(f.lineLayer, 'helpSaveEdit')
        ]
      }]
    : []

  return [
    {
      key: 'start',
      icon: 'play',
      title: t('helpStartTitle'),
      ordered: true,
      body: [t('helpStart1'), t('helpStart2'), t('helpStart3')]
    },
    {
      key: 'enter',
      icon: 'list-check',
      title: t('helpEnterTitle'),
      intro: t('helpEnterIntro'),
      body: [t('helpEnterFormats'), t('helpEnterShortcuts'), t('helpEnterNumpad'), t('helpEnterLineType'), t('helpEnterRows')]
    },
    {
      key: 'draw',
      icon: 'map',
      title: t('helpDrawTitle'),
      body: [t('helpDraw1'), t('helpDraw2'), t('helpDraw3'), t('helpDraw4')]
    },
    {
      key: 'fit',
      icon: 'cursor-marquee',
      title: t('helpFitTitle'),
      body: [t('helpFit1'), t('helpFit2')]
    },
    {
      key: 'close',
      icon: 'grid-unit',
      title: t('helpCloseTitle'),
      body: [t('helpClose1'), t('helpClose2'), t('helpClose3')]
    },
    ...saveSection,
    {
      key: 'export',
      icon: 'download',
      title: t('helpExportTitle'),
      body: [t('helpExportGeoJSON'), t('helpExportLegal')]
    },
    {
      key: 'trouble',
      icon: 'exclamation-mark-triangle',
      title: t('helpTroubleTitle'),
      body: [
        ...when(f.polygonLayer, 'helpTroubleNoPolygon'),
        ...when(f.lineLayer, 'helpTroubleSymbols'),
        ...when(anyLayer, 'helpTroubleSaveFailed'),
        t('helpTroubleNoClicks'),
        t('helpTroubleContact')
      ]
    },
    {
      key: 'tips',
      icon: 'lightbulb',
      title: t('helpTipsTitle'),
      body: [t('helpTips1'), t('helpTips2')]
    }
  ]
}
