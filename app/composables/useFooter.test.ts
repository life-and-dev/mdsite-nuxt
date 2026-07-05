/**
 * Unit tests for the pure `toFooterLinks` helper extracted from
 * `useFooter`.
 *
 * On the server, `_footer.json` is read from disk (see
 * `readFooterLinksFromDisk` and the "SERVER-SIDE FOOTER LOADING" block
 * in `useFooter.ts`), so the SSR path always returns valid JSON and this
 * coercion is a no-op there.
 *
 * These tests pin down the defensive behaviour for the CLIENT-side
 * `$fetch` path, where a missing or corrupted static file (404 HTML,
 * empty body, null from a failed fetch, etc.) could otherwise leak into
 * `AppFooter`'s `.map()` call and throw at render time.
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
