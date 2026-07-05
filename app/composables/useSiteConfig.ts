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
  features?: {
    bibleTooltips?: boolean
    sourceEdit?: string
  }
  themes?: {
    light?: { colors?: { primary?: string } }
    dark?: { colors?: { primary?: string } }
  }
}

export interface SiteConfig {
  siteName: string
  siteCanonical: string
  contentPath: string
  features: {
    bibleTooltips: boolean
    sourceEdit: string
  }
  themeColorLight: string
  themeColorDark: string
}

/**
 * Pure helper that maps the raw runtime `siteConfig` object into the shape
 * the renderer actually consumes. Extracted from `useSiteConfig` so the
 * field mapping can be unit tested independently of the Nuxt runtime.
 *
 * `sourceEdit` is a user-supplied URL prefix used by `useSourceEdit` to
 * build per-page Edit links; an empty string disables the link.
 */
export function mapSiteConfig(
  siteConfig: RawSiteConfig | undefined,
  contentPath: string | undefined,
): SiteConfig {
  return {
    siteName: siteConfig?.site?.name || '',
    siteCanonical: siteConfig?.site?.canonical || '',
    contentPath: contentPath || '.',
    features: {
      bibleTooltips: siteConfig?.features?.bibleTooltips ?? false,
      sourceEdit: siteConfig?.features?.sourceEdit ?? ''
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
    config.public.contentPath
  )
}
