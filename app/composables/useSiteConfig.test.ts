/**
 * Unit tests for the pure `mapSiteConfig` helper extracted from
 * `useSiteConfig`. The `sourceEdit` Edit-link in `AppBar` and `AppFooter`
 * is only rendered when `getEditUrl()` produces a URL, which in turn
 * requires `features.sourceEdit` to be a non-empty URL prefix. These
 * tests pin that mapping down so a future refactor cannot regress it
 * back to a boolean flag or break the empty-string default.
 */

import { describe, expect, it } from 'vitest'
import { mapSiteConfig } from './useSiteConfig'

describe('mapSiteConfig', () => {
  it('returns safe defaults when siteConfig is undefined', () => {
    const result = mapSiteConfig(undefined, undefined)

    expect(result).toEqual({
      siteName: '',
      siteCanonical: '',
      contentPath: '.',
      features: {
        bibleTooltips: false,
        sourceEdit: ''
      },
      themeColorLight: '#000000',
      themeColorDark: '#ffffff'
    })
  })

  it('reads site metadata from site.name and site.canonical', () => {
    const result = mapSiteConfig({
      site: { name: 'My Site', canonical: 'https://example.test' }
    }, undefined)

    expect(result.siteName).toBe('My Site')
    expect(result.siteCanonical).toBe('https://example.test')
  })

  describe('features', () => {
    it('defaults sourceEdit to "" and bibleTooltips to false when features is missing', () => {
      const result = mapSiteConfig({}, undefined)

      expect(result.features.bibleTooltips).toBe(false)
      expect(result.features.sourceEdit).toBe('')
    })

    it('reads sourceEdit (URL prefix) from features.sourceEdit', () => {
      const result = mapSiteConfig({
        features: { sourceEdit: 'https://github.com/org/repo/edit/main/', bibleTooltips: false }
      }, undefined)

      expect(result.features.sourceEdit).toBe('https://github.com/org/repo/edit/main/')
      expect(result.features.bibleTooltips).toBe(false)
    })

    it('reads bibleTooltips from features.bibleTooltips', () => {
      const result = mapSiteConfig({
        features: { sourceEdit: '', bibleTooltips: true }
      }, undefined)

      expect(result.features.sourceEdit).toBe('')
      expect(result.features.bibleTooltips).toBe(true)
    })
  })

  describe('theme colors', () => {
    it('uses the configured light/dark primary colors when present', () => {
      const result = mapSiteConfig({
        themes: {
          light: { colors: { primary: '#111111' } },
          dark: { colors: { primary: '#eeeeee' } }
        }
      }, undefined)

      expect(result.themeColorLight).toBe('#111111')
      expect(result.themeColorDark).toBe('#eeeeee')
    })

    it('falls back to defaults when theme colors are missing', () => {
      const result = mapSiteConfig({ themes: { light: {}, dark: {} } }, undefined)

      expect(result.themeColorLight).toBe('#000000')
      expect(result.themeColorDark).toBe('#ffffff')
    })
  })

  it('passes through the contentPath argument with a dot default', () => {
    expect(mapSiteConfig({}, '/abs/docs').contentPath).toBe('/abs/docs')
    expect(mapSiteConfig({}, undefined).contentPath).toBe('.')
    expect(mapSiteConfig({}, '').contentPath).toBe('.')
  })
})
