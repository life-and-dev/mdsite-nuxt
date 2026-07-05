/**
 * Generate source edit URL for the current page.
 *
 * `siteConfig.features.sourceEdit` is a user-supplied URL prefix (e.g.
 * `https://github.com/org/repo/edit/main`) to which the renderer's
 * per-route content path (with a `.md` suffix) is appended. The prefix is
 * normalized so the user may include or omit a trailing slash — any
 * number of trailing slashes is collapsed to exactly one. An empty or
 * whitespace-only prefix disables the link. The user is in control of
 * the full URL — no provider-specific validation is performed.
 */

/**
 * Build a source-edit URL from a user-supplied prefix and a route path.
 *
 * Exported for unit testing. Behavior:
 * - Returns `undefined` when `prefix` is empty or whitespace-only.
 * - Strips every trailing `/` from `prefix`, then inserts exactly one `/`
 *   between the prefix and the content path. This means a prefix with no
 *   trailing slash (`…/blob/main`) and a prefix with one (`…/blob/main/`)
 *   both produce the same result, and a prefix with several
 *   (`…/blob/main///`) does not yield duplicate slashes.
 * - The route `/` and an empty path both map to `index.md`.
 *
 * @param prefix      URL prefix from `features.source-edit`
 * @param routePath   Current route path (e.g. `/features/source-edit`)
 * @returns           Full edit URL, or `undefined` when disabled
 */
export function buildEditUrl(prefix: string, routePath: string): string | undefined {
    if (!prefix || prefix.trim() === '') {
        return undefined
    }

    const contentPath = !routePath || routePath === '/'
        ? 'index'
        : (routePath.startsWith('/') ? routePath.slice(1) : routePath)

    const normalizedPrefix = prefix.replace(/\/+$/, '')
    return `${normalizedPrefix}/${contentPath}.md`
}

export function useSourceEdit() {
    const route = useRoute()
    const siteConfig = useSiteConfig()

    /**
     * Generate source edit URL for current route
     * @returns source edit URL or undefined if not enabled or not a content page
     */
    function getEditUrl(): string | undefined {
        return buildEditUrl(siteConfig.features.sourceEdit, route.path)
    }

    return {
        getEditUrl
    }
}
