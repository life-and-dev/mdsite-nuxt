import type { FooterLink } from '../../scripts/generate-indices'
import { withBasePath } from '../../utils/base-url'

/**
 * Coerce an unknown payload into a `FooterLink[]`. Returns the array
 * unchanged when it is already an array, and an empty array for anything
 * else (object, string, null, undefined, primitive). Extracted so the
 * type-guard can be unit-tested without mocking `$fetch`.
 *
 * On the server, `_footer.json` is now read from disk (see
 * `readFooterLinksFromDisk` below), so the SSR path always returns valid
 * JSON and this guard is a no-op there. It is retained as a defensive
 * measure for the client-side `$fetch` path, where a missing or corrupted
 * static file (404 HTML, empty body, etc.) could otherwise leak into
 * `AppFooter`'s `.map()` call and throw at render time.
 */
export function toFooterLinks(result: unknown): FooterLink[] {
  return Array.isArray(result) ? (result as FooterLink[]) : []
}

// ---------------------------------------------------------------------------
// SERVER-SIDE FOOTER LOADING — DELIBERATE CODE SMELL
// ---------------------------------------------------------------------------
//
// What smells:
//   A Vue composable (`useFooter`) reads a JSON file from disk via
//   `node:fs/promises`. Composables should own reactive Vue state, not
//   perform server-side file I/O. The idiomatic Nuxt/Nitro solution would
//   be a server route at `server/routes/_footer.json.ts` that reads and
//   returns the JSON, leaving the composable to a plain `$fetch`.
//
// Why we rejected the idiomatic solution (server route):
//
//   During `nuxi generate`, the `$fetch('/_footer.json')` call inside
//   `useAsyncData` is resolved by Nitro's `localFetch`, NOT by the
//   static-file middleware that serves `public/` at runtime. With no
//   Nitro route registered for `/_footer.json`, `localFetch` falls through
//   to the catch-all HTML route (the root page), which renders
//   `<AppFooter />`, which calls `useFooter()` again, etc. — producing a
//   prerender loop that Nitro aborts with `508 Loop detected`:
//
//     "/" -> "/_footer.json" -> "/" -> "/_footer.json" -> 508
//
//   A server route would fix the ROOT base-URL case
//   (`NUXT_APP_BASE_URL=/`) because Nitro would match
//   `localFetch('/_footer.json')` to the registered handler. BUT it
//   reintroduces the identical 508 loop for SUB-PATH deployments, which
//   the mdsite CLI explicitly supports:
//
//     - `src/commands/prepare.ts` generates a GitHub Pages workflow that
//       sets `NUXT_APP_BASE_URL: ${{ steps.pages.outputs.base_path }}/`
//       (e.g. `/my-repo/`).
//     - The composable fetches `withBasePath('/_footer.json', appBaseURL)`,
//       which becomes `/my-repo/_footer.json` under a sub-path base URL.
//     - Nitro does NOT strip `app.baseURL` before route matching — server
//       routes are registered at their filesystem-relative path
//       (`/_footer.json`), with no base-URL prefix. So
//       `localFetch('/my-repo/_footer.json')` finds no handler and falls
//       through to the catch-all -> loop -> 508. This is confirmed by
//       Nitro/h3 source (`event.url.pathname` is matched as-is) and a long
//       history of upstream issues (nuxt/nuxt#13810, #13871, #27923,
//       #30367, and others).
//     - The only Nitro-side workaround is `experimental.runtimeBaseURL:
//       true`, which is opt-in, still experimental, and carries its own
//       open issues. Depending on it would couple the renderer to an
//       unstable Nuxt feature for a single bug fix.
//
//   Reading the file directly from disk sidesteps `localFetch` entirely:
//   `fs.readFile` does not route through Nitro, so the base URL is
//   irrelevant and the loop cannot form — for root or sub-path deploys.
//
// Trade-offs accepted:
//   - The composable now references `node:fs/promises` and `node:path`
//     via dynamic `import()` inside an `import.meta.server` branch.
//     `import.meta.server` is a compile-time constant, so Vite/Rollup
//     eliminate the dead branch from the client bundle and the `node:*`
//     modules never reach the browser. The server build externalises
//     them via the existing `vite.build.rollupOptions.external` in
//     `nuxt.config.ts`.
//   - `readFooterLinksFromDisk()` mirrors `getTargetDir()` + `_footer.json`
//     in `scripts/generate-indices.ts` (honors `$MDSITE_PUBLIC_DIR`,
//     falls back to `<renderer>/public`). Both must stay in sync — if
//     the generator's target dir changes, update both call sites.
//   - SSR data is transferred to the client via `useAsyncData`'s
//     `'footer-links'` payload, so hydration is consistent: the client
//     reads from the payload, not from a second fetch.
//
// When to revisit:
//   If Nitro/Nuxt stabilises base-URL-aware server-route matching
//   (`experimental.runtimeBaseURL` or equivalent) AND the mdsite test
//   suite covers sub-path prerender, this disk read can be replaced with
//   a `server/routes/_footer.json.ts` handler. Until then, the smell is
//   intentional and documented.
// ---------------------------------------------------------------------------

/**
 * Read `_footer.json` from disk during SSR. Server-only — see the
 * "SERVER-SIDE FOOTER LOADING" block above for why this exists instead of
 * a Nitro server route.
 *
 * Dynamic imports keep `node:fs/promises` and `node:path` out of the
 * client bundle; `import.meta.server` guarantees this function is never
 * invoked on the client (the caller gates the branch at compile time).
 *
 * Path resolution mirrors `getTargetDir()` + `_footer.json` in
 * `scripts/generate-indices.ts`:
 *   - `$MDSITE_PUBLIC_DIR` overrides the whole public dir.
 *   - Otherwise resolves to `<process.cwd()>/public/_footer.json`,
 *     which during `nuxi generate` is the renderer's `public/` dir
 *     (the file written by `generateFooterJson()` in the `build:before`
 *     hook, before prerender starts).
 */
async function readFooterLinksFromDisk(): Promise<FooterLink[]> {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const publicDir = process.env.MDSITE_PUBLIC_DIR
    ?? resolve(process.cwd(), 'public')
  try {
    const content = await readFile(resolve(publicDir, '_footer.json'), 'utf-8')
    return toFooterLinks(JSON.parse(content))
  } catch (err) {
    console.error('Error loading footer links from disk:', err)
    return []
  }
}

/**
 * Fetch and cache footer links from the pre-built JSON file.
 *
 * Uses `useAsyncData` so the load happens during SSR — the result is
 * transferred to the client on hydration and the footer is part of the
 * initial HTML payload (no FOUC). The result is cached by the
 * `'footer-links'` key, so repeated calls return the same data.
 *
 * On the server, `_footer.json` is read directly from disk (see
 * `readFooterLinksFromDisk`) to avoid the prerender loop documented in
 * the "SERVER-SIDE FOOTER LOADING" block above. On the client, the
 * static file is fetched via `$fetch` with the app base URL prepended
 * so sub-path deployments resolve correctly at runtime.
 */
export function useFooter() {
  const appBaseURL = useRuntimeConfig().app.baseURL
  const { data, pending, error, refresh } = useAsyncData<FooterLink[]>(
    'footer-links',
    async () => {
      // Server: read from disk to avoid the prerender loop (see the
      // "SERVER-SIDE FOOTER LOADING" block above for the full rationale).
      // `import.meta.server` is a compile-time constant, so Vite
      // eliminates this branch — and the `node:*` dynamic imports it
      // references — from the client bundle entirely.
      if (import.meta.server) {
        return readFooterLinksFromDisk()
      }
      // Client: fetch the static file served by the host. `withBasePath`
      // prepends the app base URL so sub-path deploys (GitHub Pages
      // project pages, etc.) resolve correctly at runtime.
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
      // waiting for the data; `hasFooterEntries` stays `false` until
      // the load resolves with at least one entry.
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
