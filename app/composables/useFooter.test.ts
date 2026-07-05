/**
 * Unit tests for the pure `toFooterLinks` helper extracted from
 * `useFooter`. The composable now uses `useAsyncData`, which fetches
 * `/_footer.json` during SSR. The Nitro static preset (used by
 * `mdsite generate`) does not serve that file as a static asset, so the
 * prerender's `localFetch` falls through to the catch-all HTML route and
 * returns the page HTML string. Without coercion that string ends up in
 * `data.value` and the AppFooter's `.map()` call throws. These tests pin
 * the defensive behaviour down.
 */

import { describe, expect, it } from 'vitest'

import { toFooterLinks } from './useFooter'

describe('toFooterLinks', () => {
  it('returns the array unchanged when the response is a valid FooterLink[]', () => {
    const links = [
      { path: '/about', title: 'About', type: 'link' as const, isExternal: false },
      { path: 'https://example.com', title: 'Example', type: 'link' as const, isExternal: true }
    ]

    expect(toFooterLinks(links)).toBe(links)
  })

  it('returns an empty array when the response is an empty array', () => {
    expect(toFooterLinks([])).toEqual([])
  })

  it('returns an empty array when the response is an HTML string (Nitro static preset prerender fallback)', () => {
    const html = '<!DOCTYPE html><html><body>Page</body></html>'

    expect(toFooterLinks(html)).toEqual([])
  })

  it('returns an empty array when the response is null', () => {
    expect(toFooterLinks(null)).toEqual([])
  })

  it('returns an empty array when the response is undefined', () => {
    expect(toFooterLinks(undefined)).toEqual([])
  })

  it('returns an empty array when the response is a plain object (e.g. 404 JSON body)', () => {
    expect(toFooterLinks({ error: true, statusCode: 404 })).toEqual([])
  })

  it('returns an empty array when the response is a number or boolean', () => {
    expect(toFooterLinks(0)).toEqual([])
    expect(toFooterLinks(1)).toEqual([])
    expect(toFooterLinks(false)).toEqual([])
    expect(toFooterLinks(true)).toEqual([])
  })
})
