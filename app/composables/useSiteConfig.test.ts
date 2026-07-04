/**
 * Unit tests for the pure `mapSiteConfig` helper extracted from
 * `useSiteConfig`. The `sourceEdit` Edit-on-GitHub link in `AppBar` and
 * `AppFooter` is only rendered when `getEditUrl()` produces a URL, which
 * in turn requires `contentGitRepo` to be populated from `server.repo`.
 * These tests pin that mapping down so a future refactor cannot regress
 * it back to the empty-string default.
 */

import { describe, expect, it } from 'vitest'
import { mapSiteConfig } from './useSiteConfig'

describe('mapSiteConfig', () => {
  it('returns safe defaults when siteConfig is undefined', () => {
    const result = mapSiteConfig(undefined, undefined)

    expect(result).toEqual({
      siteName: '',
      siteCanonical: '',
      contentGitRepo: '',
      contentGitBranch: 'main',
      contentGitPath: '.',
      contentPath: '.',
      features: {
        bibleTooltips: false,
        sourceEdit: false
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

  describe('contentGitRepo (Edit on GitHub source)', () => {
    it('reads server.repo into contentGitRepo', () => {
      const result = mapSiteConfig({
        server: { repo: 'https://github.com/life-and-dev/mdsite' }
      }, undefined)

      expect(result.contentGitRepo).toBe('https://github.com/life-and-dev/mdsite')
    })

    it('defaults to empty string when server.repo is missing', () => {
      const result = mapSiteConfig({ server: {} }, undefined)

      expect(result.contentGitRepo).toBe('')
    })

    it('defaults to empty string when server is missing entirely', () => {
      const result = mapSiteConfig({}, undefined)

      expect(result.contentGitRepo).toBe('')
    })
  })

  describe('contentGitBranch (Edit on GitHub source)', () => {
    it('defaults to "main" when server.gitBranch is missing', () => {
      expect(mapSiteConfig({}, undefined).contentGitBranch).toBe('main')
    })

    it('defaults to "main" when server is missing entirely', () => {
      expect(mapSiteConfig({ server: {} }, undefined).contentGitBranch).toBe('main')
    })

    it('reads server.gitBranch into contentGitBranch', () => {
      const result = mapSiteConfig({
        server: { gitBranch: 'develop' }
      }, undefined)

      expect(result.contentGitBranch).toBe('develop')
    })

    it('treats an empty string server.gitBranch as missing and falls back to "main"', () => {
      // Whitespace-only branches are normalised away upstream in
      // `utils/mdsite-config.ts` `normalizeMdsiteConfig`; the mapper here
      // only falls back on the empty string, not on whitespace.
      expect(mapSiteConfig({ server: { gitBranch: '' } }, undefined).contentGitBranch).toBe('main')
    })
  })

  describe('features', () => {
    it('defaults both feature flags to false when features is missing', () => {
      const result = mapSiteConfig({}, undefined)

      expect(result.features.bibleTooltips).toBe(false)
      expect(result.features.sourceEdit).toBe(false)
    })

    it('reads sourceEdit from features.sourceEdit', () => {
      const result = mapSiteConfig({
        features: { sourceEdit: true, bibleTooltips: false }
      }, undefined)

      expect(result.features.sourceEdit).toBe(true)
      expect(result.features.bibleTooltips).toBe(false)
    })

    it('reads bibleTooltips from features.bibleTooltips', () => {
      const result = mapSiteConfig({
        features: { sourceEdit: false, bibleTooltips: true }
      }, undefined)

      expect(result.features.sourceEdit).toBe(false)
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

  describe('contentGitPath (Edit on GitHub source)', () => {
    it('defaults to "." when contentGitPath is undefined', () => {
      // Preserves the historical cwd-relative fallback so existing
      // callers/tests that omit the third arg keep working.
      expect(mapSiteConfig({}, undefined).contentGitPath).toBe('.')
      expect(mapSiteConfig({}, undefined, undefined).contentGitPath).toBe('.')
    })

    it('defaults to "." when contentGitPath is an empty string', () => {
      // Empty string is treated as missing so an absent
      // runtimeConfig.public.contentGitPath falls back cleanly.
      expect(mapSiteConfig({}, undefined, '').contentGitPath).toBe('.')
    })

    it('passes an absolute contentGitPath through unchanged', () => {
      // The renderer supplies `path.dirname(mdsite.configPath)` here so
      // `relative(contentGitPath, contentPath)` is cwd-independent and
      // identical on server and client (no hydration mismatch).
      expect(
        mapSiteConfig({}, '/home/user/site/docs', '/home/user/site').contentGitPath
      ).toBe('/home/user/site')
    })
  })
})
