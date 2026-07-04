/**
 * Subset of the runtime `mdsite.yml` config shape that `useSiteConfig`
 * consumes. The runtime value is the full `MdsiteConfig`, but we type only
 * the fields this composable reads so the pure mapper below can be unit
 * tested without pulling in the entire config schema.
 */
export interface RawSiteConfig {
  site?: {
    name?: string
    canonical?: string
  }
  server?: {
    repo?: string
    gitBranch?: string
  }
  features?: {
    bibleTooltips?: boolean
    sourceEdit?: boolean
  }
  themes?: {
    light?: { colors?: { primary?: string } }
    dark?: { colors?: { primary?: string } }
  }
}

export interface SiteConfig {
  siteName: string
  siteCanonical: string
  contentGitRepo: string
  contentGitBranch: string
  contentGitPath: string
  contentPath: string
  features: {
    bibleTooltips: boolean
    sourceEdit: boolean
  }
  themeColorLight: string
  themeColorDark: string
}

/**
 * Pure helper that maps the raw runtime `siteConfig` object into the shape
 * the renderer actually consumes. Extracted from `useSiteConfig` so the
 * field mapping (notably `contentGitRepo` ← `server.repo`, which is what
 * powers the Edit on GitHub link in `AppBar` and `AppFooter`) can be unit
 * tested independently of the Nuxt runtime.
 *
 * `contentGitPath` must be an absolute path when supplied (the renderer
 * sets it from `path.dirname(mdsite.configPath)` in `nuxt.config.ts`).
 * Leaving it undefined preserves the historical cwd-relative `'.'`
 * default, which is only correct when the renderer's cwd equals the git
 * repo root — pass an absolute path to make `useSourceEdit`'s
 * `relative(contentGitPath, contentPath)` computation deterministic
 * across server and client and avoid hydration mismatches.
 */
export function mapSiteConfig(
  siteConfig: RawSiteConfig | undefined,
  contentPath: string | undefined,
  contentGitPath: string | undefined = '.',
): SiteConfig {
  return {
    siteName: siteConfig?.site?.name || '',
    siteCanonical: siteConfig?.site?.canonical || '',
    contentGitRepo: siteConfig?.server?.repo || '',
    contentGitBranch: siteConfig?.server?.gitBranch || 'main',
    contentGitPath: contentGitPath || '.',
    contentPath: contentPath || '.',
    features: {
      bibleTooltips: siteConfig?.features?.bibleTooltips ?? false,
      sourceEdit: siteConfig?.features?.sourceEdit ?? false
    },
    themeColorLight: siteConfig?.themes?.light?.colors?.primary || '#000000',
    themeColorDark: siteConfig?.themes?.dark?.colors?.primary || '#ffffff'
  }
}

/**
 * Get site configuration based on runtime config
 */
export function useSiteConfig(): SiteConfig {
  const config = useRuntimeConfig()
  const siteConfig = config.public.siteConfig as RawSiteConfig | undefined

  return mapSiteConfig(
    siteConfig,
    config.public.contentPath,
    config.public.contentGitPath as string | undefined
  )
}
