import { nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  buildMermaidThemeVariables,
  initializeMermaid,
  watchMermaidTheme,
  type MdsiteThemeColors
} from './mermaid-theme'

const lightColors: MdsiteThemeColors = {
  primary: '#light-primary',
  'on-primary': '#light-on-primary',
  secondary: '#light-secondary',
  'on-secondary': '#light-on-secondary',
  surface: '#light-surface',
  'on-surface': '#light-on-surface',
  background: '#light-background',
  'on-background': '#light-on-background',
  outline: '#light-outline',
  selected: '#light-selected',
  'on-selected': '#light-on-selected',
  info: '#light-info',
  'on-info': '#light-on-info',
  success: '#light-success',
  'on-success': '#light-on-success',
  warning: '#light-warning',
  'on-warning': '#light-on-warning',
  error: '#light-error',
  'on-error': '#light-on-error'
}

const darkColors: MdsiteThemeColors = {
  primary: '#dark-primary',
  'on-primary': '#dark-on-primary',
  secondary: '#dark-secondary',
  'on-secondary': '#dark-on-secondary',
  surface: '#dark-surface',
  'on-surface': '#dark-on-surface',
  background: '#dark-background',
  'on-background': '#dark-on-background',
  outline: '#dark-outline',
  selected: '#dark-selected',
  'on-selected': '#dark-on-selected',
  info: '#dark-info',
  'on-info': '#dark-on-info',
  success: '#dark-success',
  'on-success': '#dark-on-success',
  warning: '#dark-warning',
  'on-warning': '#dark-on-warning',
  error: '#dark-error',
  'on-error': '#dark-on-error'
}

describe('Mermaid theme', () => {
  it('initializes diagram surfaces and status roles from active semantic colors', () => {
    const initialize = vi.fn()

    initializeMermaid({ initialize }, lightColors)

    expect(initialize).toHaveBeenCalledOnce()
    const variables = initialize.mock.calls[0]?.[0].themeVariables

    expect(variables).toMatchObject({
      primaryColor: lightColors.primary,
      primaryTextColor: lightColors['on-primary'],
      nodeBorder: lightColors.outline,
      nodeTextColor: lightColors['on-surface'],
      lineColor: lightColors.secondary,
      defaultLinkColor: lightColors.secondary,
      clusterBkg: lightColors.background,
      noteBkgColor: lightColors.selected,
      noteTextColor: lightColors['on-selected'],
      edgeLabelBackground: lightColors.background,
      actorBkg: lightColors.surface,
      actorTextColor: lightColors['on-surface'],
      actorLineColor: lightColors.secondary,
      doneTaskBkgColor: lightColors.success,
      critBkgColor: lightColors.error,
      todayLineColor: lightColors.warning,
      git5: lightColors.info,
      gitInv5: lightColors['on-info']
    })
  })

  it('produces distinct variables for light and dark themes', () => {
    const lightVariables = buildMermaidThemeVariables(lightColors)
    const darkVariables = buildMermaidThemeVariables(darkColors)

    expect(darkVariables.primaryColor).toBe(darkColors.primary)
    expect(darkVariables.lineColor).toBe(darkColors.secondary)
    expect(darkVariables.defaultLinkColor).toBe(darkColors.secondary)
    expect(darkVariables.actorLineColor).toBe(darkColors.secondary)
    expect(darkVariables.noteTextColor).toBe(darkColors['on-selected'])
    expect(darkVariables).not.toEqual(lightVariables)
  })

  it('uses related semantic colors when optional mdsite roles are unavailable', () => {
    const variables = buildMermaidThemeVariables({
      ...lightColors,
      outline: undefined,
      selected: undefined,
      'on-selected': undefined,
      'on-success': undefined
    })

    expect(variables.nodeBorder).toBe(lightColors['on-surface'])
    expect(variables.noteBkgColor).toBe(lightColors.surface)
    expect(variables.noteTextColor).toBe(lightColors['on-surface'])
    expect(variables.gitInv2).toBe(lightColors['on-surface'])
  })

  it('requests a render after theme changes until the watcher is stopped', async () => {
    const activeTheme = ref({ colors: lightColors })
    const render = vi.fn()
    const stopWatching = watchMermaidTheme(() => activeTheme.value, render)

    activeTheme.value = { colors: darkColors }
    await nextTick()

    expect(render).toHaveBeenCalledOnce()
    expect(buildMermaidThemeVariables(activeTheme.value.colors).primaryColor).toBe(darkColors.primary)
    stopWatching()

    activeTheme.value = { colors: lightColors }
    await nextTick()

    expect(render).toHaveBeenCalledOnce()
  })
})
