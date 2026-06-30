import type { ThemeDefinition } from 'vuetify'
import { loadMdsiteConfigSync } from '../../utils/mdsite-config'

/**
 * Get theme configuration from the active mdsite config
 */
export function getDomainThemes(domain: string | undefined): Record<string, ThemeDefinition> {
  const themes = loadMdsiteConfigSync().config.themes as Record<string, ThemeDefinition>

  void domain

  for (const [name, theme] of Object.entries(themes)) {
    (theme as any).dark = name.toLowerCase().includes('dark')
  }

  return themes
}

/**
 * Parse a `#rrggbb` hex color into an `"r,g,b"` triplet string.
 * Returns `'0,0,0'` for any malformed input (missing `#` and not 6 hex digits).
 */
export function hexToRgbTriplet(hex: string): string {
  const cleaned = hex.startsWith('#') ? hex.slice(1) : hex
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return '0,0,0'
  }
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  return `${r},${g},${b}`
}

/**
 * Build a CSS rule that re-declares the dark theme's CSS variables on every
 * `.v-theme--light` element when `<html data-mdsite-theme="dark">` is set.
 * This paints the correct dark colors BEFORE Vuetify's runtime class swap,
 * so a first visit with system dark shows dark immediately and chrome stays
 * in sync with @nuxt/content (which lives outside the `.v-theme--light` tree).
 */
export function buildDarkOverrideCss(): string {
  const themes = loadMdsiteConfigSync().config.themes as Record<string, { colors: Record<string, string> }>
  const darkTheme = Object.entries(themes).find(([name]) => name.toLowerCase().includes('dark'))?.[1]
    ?? themes.dark

  if (!darkTheme) {
    return ''
  }

  const declarations = Object.entries(darkTheme.colors)
    .map(([key, value]) => `  --v-theme-${key}: ${hexToRgbTriplet(value)};`)
    .join('\n')

  return `html[data-mdsite-theme="dark"] .v-theme--light {\n${declarations}\n}`
}
