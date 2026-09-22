import { watch, type WatchSource, type WatchStopHandle } from 'vue'
import type { MermaidConfig } from 'mermaid'

export type MermaidThemeVariables = Record<string, string>

export interface MdsiteThemeColors {
  readonly [role: string]: unknown
  readonly primary: unknown
  readonly 'on-primary': unknown
  readonly secondary: unknown
  readonly 'on-secondary': unknown
  readonly surface: unknown
  readonly 'on-surface': unknown
  readonly background: unknown
  readonly 'on-background': unknown
  readonly info: unknown
  readonly success: unknown
  readonly warning: unknown
  readonly error: unknown
}

interface MermaidInitializer {
  initialize(config: MermaidConfig): void
}

function getThemeColor(colors: MdsiteThemeColors, role: string, fallbackRole?: string): string {
  const color = colors[role]
  if (typeof color === 'string') return color

  const fallback = fallbackRole ? colors[fallbackRole] : undefined
  if (typeof fallback === 'string') return fallback

  throw new TypeError(`Mermaid theme requires a string color for "${role}"`)
}

export function buildMermaidThemeVariables(colors: MdsiteThemeColors): MermaidThemeVariables {
  const primary = getThemeColor(colors, 'primary')
  const onPrimary = getThemeColor(colors, 'on-primary', 'on-surface')
  const secondary = getThemeColor(colors, 'secondary')
  const onSecondary = getThemeColor(colors, 'on-secondary', 'on-surface')
  const surface = getThemeColor(colors, 'surface')
  const onSurface = getThemeColor(colors, 'on-surface')
  const background = getThemeColor(colors, 'background')
  const onBackground = getThemeColor(colors, 'on-background', 'on-surface')
  const outline = getThemeColor(colors, 'outline', 'on-surface')
  const selected = getThemeColor(colors, 'selected', 'surface')
  const onSelected = getThemeColor(colors, 'on-selected', 'on-surface')
  const info = getThemeColor(colors, 'info', 'primary')
  const onInfo = getThemeColor(colors, 'on-info', 'on-surface')
  const success = getThemeColor(colors, 'success', 'primary')
  const onSuccess = getThemeColor(colors, 'on-success', 'on-surface')
  const warning = getThemeColor(colors, 'warning', 'secondary')
  const onWarning = getThemeColor(colors, 'on-warning', 'on-surface')
  const error = getThemeColor(colors, 'error', 'primary')
  const onError = getThemeColor(colors, 'on-error', 'on-surface')

  return {
    background,
    primaryColor: primary,
    primaryTextColor: onPrimary,
    primaryBorderColor: outline,
    secondaryColor: secondary,
    secondaryTextColor: onSecondary,
    secondaryBorderColor: outline,
    tertiaryColor: surface,
    tertiaryTextColor: onSurface,
    tertiaryBorderColor: outline,
    textColor: onSurface,
    titleColor: onBackground,
    lineColor: outline,
    arrowheadColor: onSurface,
    mainBkg: surface,
    secondBkg: background,
    nodeBorder: outline,
    nodeTextColor: onSurface,
    defaultLinkColor: outline,
    edgeLabelBackground: background,
    labelBackground: background,
    clusterBkg: background,
    clusterBorder: outline,
    actorBkg: surface,
    actorBorder: outline,
    actorTextColor: onSurface,
    actorLineColor: outline,
    signalColor: onSurface,
    signalTextColor: onSurface,
    labelBoxBkgColor: selected,
    labelBoxBorderColor: outline,
    labelTextColor: onSelected,
    loopTextColor: onSurface,
    noteBkgColor: selected,
    noteBorderColor: outline,
    noteTextColor: onSelected,
    activationBkgColor: selected,
    activationBorderColor: primary,
    sequenceNumberColor: onPrimary,
    sectionBkgColor: selected,
    altSectionBkgColor: surface,
    sectionBkgColor2: background,
    taskBkgColor: surface,
    taskBorderColor: outline,
    taskTextColor: onSurface,
    taskTextLightColor: onSurface,
    taskTextDarkColor: onSurface,
    taskTextOutsideColor: onBackground,
    taskTextClickableColor: primary,
    activeTaskBkgColor: primary,
    activeTaskBorderColor: primary,
    doneTaskBkgColor: success,
    doneTaskBorderColor: success,
    critBkgColor: error,
    critBorderColor: error,
    todayLineColor: warning,
    gridColor: outline,
    errorBkgColor: error,
    errorTextColor: onError,
    git0: primary,
    gitInv0: onPrimary,
    git1: secondary,
    gitInv1: onSecondary,
    git2: success,
    gitInv2: onSuccess,
    git3: warning,
    gitInv3: onWarning,
    git4: error,
    gitInv4: onError,
    git5: info,
    gitInv5: onInfo
  }
}

export function initializeMermaid(mermaid: MermaidInitializer, colors: MdsiteThemeColors): void {
  mermaid.initialize({
    startOnLoad: false,
    htmlLabels: false,
    theme: 'base',
    themeVariables: buildMermaidThemeVariables(colors),
    securityLevel: 'loose',
    fontFamily: 'Noto Sans, sans-serif'
  })
}

export function watchMermaidTheme(source: WatchSource<unknown>, render: () => void): WatchStopHandle {
  return watch(source, render, { deep: true })
}
