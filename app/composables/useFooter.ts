import type { FooterLink } from '../../scripts/generate-indices'
import { withBasePath } from '../../utils/base-url'

/**
 * Coerce an unknown `$fetch` response into a `FooterLink[]`. Returns the
 * array unchanged when the response is an array, and an empty array for
 * anything else (object, string, null, undefined, primitive). Extracted so
 * the type-guard can be unit-tested without mocking `$fetch`.
 *
 * Guards against two known environments where `/_footer.json` is not
 * served as JSON:
 *   - `mdsite generate` (Nitro static preset) — `localFetch('/_footer.json')`
 *     falls through to the catch-all HTML route and returns the page HTML
 *     string instead of the JSON payload.
 *   - Bare `node-server` boot before `generateFooterJson` has written the
 *     file yet — the catch-all returns the not-found HTML page.
 */
export function toFooterLinks(result: unknown): FooterLink[] {
  return Array.isArray(result) ? (result as FooterLink[]) : []
}

/**
 * Fetch and cache footer links from the pre-built JSON file.
 *
 * Uses `useAsyncData` so the fetch happens during SSR — the result is
 * transferred to the client on hydration and the footer is part of the
 * initial HTML payload (no FOUC). The fetch is cached by the
 * `'footer-links'` key, so repeated calls return the same data.
 */
export function useFooter() {
  const appBaseURL = useRuntimeConfig().app.baseURL
  const { data, pending, error, refresh } = useAsyncData<FooterLink[]>(
    'footer-links',
    async () => {
      try {
        return toFooterLinks(
          await $fetch<unknown>(withBasePath('/_footer.json', appBaseURL))
        )
      } catch (err) {
        console.error('Error loading footer links:', err)
        return []
      }
    },
    {
      // Default to an empty array so the SSR shell can render without
      // waiting for the data; `hasFooterEntries` stays `false` until the
      // fetch resolves with at least one entry.
      default: () => []
    }
  )

  // `error` is still exposed for consumers that want to surface it, even
  // though we no longer let it short-circuit the SSR pass.
  if (error.value) {
    console.error('Error loading footer links:', error.value)
  }

  return {
    links: data,
    isLoading: pending,
    refresh
  }
}
