/**
 * Unit tests for `buildEditUrl`, the pure helper extracted from
 * `useSourceEdit`. The composable itself depends on Nuxt's auto-imported
 * `useRoute`/`useSiteConfig`, so the testable surface is the pure
 * function. The slug-derivation logic in `mapSiteConfig` is already
 * pinned by `useSiteConfig.test.ts`; these tests pin the URL-building
 * behavior — most importantly that a user-supplied `source-edit` URL
 * without a trailing slash still produces a valid path with exactly
 * one separator (no `…/blob/mainindex.md` bug, no duplicate slashes).
 */

import { describe, expect, it } from 'vitest'
import { buildEditUrl } from './useSourceEdit'

describe('buildEditUrl', () => {
  describe('disabled prefix', () => {
    it('returns undefined when prefix is empty', () => {
      expect(buildEditUrl('', '/features/source-edit')).toBeUndefined()
    })

    it('returns undefined when prefix is whitespace-only', () => {
      expect(buildEditUrl('   ', '/features/source-edit')).toBeUndefined()
    })

    it('does not depend on route path when prefix is empty', () => {
      expect(buildEditUrl('', '/')).toBeUndefined()
      expect(buildEditUrl('', '')).toBeUndefined()
    })
  })

  describe('separator normalization', () => {
    const nestedPath = '/features/source-edit'

    it('inserts a single "/" when prefix has no trailing slash', () => {
      // Regression: previously produced `…/blob/mainfeatures/source-edit.md`.
      expect(buildEditUrl('https://github.com/org/repo/blob/main', nestedPath))
        .toBe('https://github.com/org/repo/blob/main/features/source-edit.md')
    })

    it('keeps exactly one "/" when prefix already has a trailing slash', () => {
      expect(buildEditUrl('https://github.com/org/repo/blob/main/', nestedPath))
        .toBe('https://github.com/org/repo/blob/main/features/source-edit.md')
    })

    it('collapses multiple trailing slashes to one', () => {
      expect(buildEditUrl('https://github.com/org/repo/blob/main///', nestedPath))
        .toBe('https://github.com/org/repo/blob/main/features/source-edit.md')
      expect(buildEditUrl('https://github.com/org/repo/blob/main//', nestedPath))
        .toBe('https://github.com/org/repo/blob/main/features/source-edit.md')
    })

    it('does not double-slash when prefix path component already ends with slash', () => {
      // Defensive: ensures normalize strips every trailing slash, not just
      // the last one.
      expect(buildEditUrl('https://github.com/org/repo/blob/main//', '/index'))
        .toBe('https://github.com/org/repo/blob/main/index.md')
    })
  })

  describe('route path handling', () => {
    const prefix = 'https://github.com/org/repo/blob/main'

    it('maps the root path "/" to index.md', () => {
      expect(buildEditUrl(prefix, '/')).toBe(`${prefix}/index.md`)
    })

    it('maps an empty path to index.md', () => {
      expect(buildEditUrl(prefix, '')).toBe(`${prefix}/index.md`)
    })

    it('strips a leading slash from nested paths', () => {
      expect(buildEditUrl(prefix, '/features/source-edit'))
        .toBe(`${prefix}/features/source-edit.md`)
    })

    it('passes nested paths without leading slash through unchanged', () => {
      expect(buildEditUrl(prefix, 'features/source-edit'))
        .toBe(`${prefix}/features/source-edit.md`)
    })

    it('handles single-segment nested paths', () => {
      expect(buildEditUrl(prefix, '/menu'))
        .toBe(`${prefix}/menu.md`)
    })
  })

  describe('combined normalization + route handling', () => {
    it('produces the documented URL for the docs site root with no trailing slash', () => {
      // The exact case from the bug report: `mdsite.yml:6` has no trailing
      // slash and the docs root resolves to `index.md`.
      expect(buildEditUrl('https://github.com/life-and-dev/mdsite/blob/main', '/'))
        .toBe('https://github.com/life-and-dev/mdsite/blob/main/index.md')
    })

    it('produces the same URL whether or not the user adds a trailing slash', () => {
      const a = buildEditUrl('https://github.com/org/repo/blob/main', '/features/source-edit')
      const b = buildEditUrl('https://github.com/org/repo/blob/main/', '/features/source-edit')
      const c = buildEditUrl('https://github.com/org/repo/blob/main///', '/features/source-edit')
      expect(a).toBe(b)
      expect(b).toBe(c)
    })
  })
})
