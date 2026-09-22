import fs from 'fs';
import path from 'path';
import YAML from 'yaml';

/**
 * Recursive shape of a single `mdsite.yml` `menu:` entry.
 *
 * - `string`        → flat link to a markdown slug
 *                     (e.g. `- genesis`, `- resurrections`)
 * - `null`          → visual separator (`===` in YAML)
 * - `Record<string, MdsiteMenuValue>` → group: object whose keys are group
 *                     labels (e.g. `"Members of the Trinity":`) and whose
 *                     values are `MdsiteMenuValue` items
 * - `MdsiteMenuValue` (the value side of a group) can be:
 *     - `string`         → alias link with custom title
 *                          (e.g. `"Job": https://...`, `"Homepage": index`)
 *     - `null`           → group label only (renders as a heading, no link)
 *     - `MdsiteMenuItem[]` → nested submenu (recursive)
 *
 * Keeping this a `type` alias (not an `interface`) and avoiding `any` lets
 * Nuxt's runtime-config type generator infer `runtimeConfig.public.siteConfig`
 * without collapsing `menu` to `{}[]`. See `nuxt.config.ts` for the cast
 * history this replaces.
 */
export type MdsiteMenuItem = string | null | MdsiteMenuGroup
export type MdsiteMenuGroup = { [key: string]: MdsiteMenuValue }
export type MdsiteMenuValue = string | null | MdsiteMenuItem[]

/**
 * Footer items mirror the `menu` shape but with no nested sub-menus. Each item
 * is one of:
 *   - a bare markdown file name (string) — title is read from the file's H1
 *   - `null` — rendered as a vertical separator
 *   - a single-key object — the key is the link text, the value is either an
 *     internal markdown path or an external URL (http/https)
 *
 * Lives under `features.footer` in `mdsite.yml`. Keep this type in sync with
 * the CLI's `FooterItem` in `src/config/mdsite-config.ts`.
 */
export type MdsiteFooterItem = string | null | { [key: string]: string | null }

export interface MdsiteConfig {
  features: {
    bibleTooltips: boolean
    /**
     * URL prefix used to build the "Edit on …" link for a content page.
     * The renderer appends `<contentPath>.md` to this prefix, so it must
     * already include any path segment between the host and the content
     * file (e.g. `https://github.com/org/repo/edit/main/`). An empty
     * string disables the link.
     */
    sourceEdit: string
    /**
     * Footer items mirror the `menu` shape but with no nested sub-menus. Each
     * item is one of:
     *   - a bare markdown file name (string) — title is read from the file's H1
     *   - `null` — rendered as a vertical separator
     *   - a single-key object — the key is the link text, the value is either
     *     an internal markdown path or an external URL (http/https)
     *
     * Lives under `features.footer` in `mdsite.yml`. Keep this in sync with
     * the CLI's `FooterItem` in `src/config/mdsite-config.ts`.
     */
    footer: MdsiteFooterItem[]
  }
  menu: MdsiteMenuItem[]
  paths: {
    ignore: string | string[]
    input: string
    build: string
    output: string
  }
  site: {
    canonical: string
    favicon: string
    name: string
  }
  themes: {
    light: {
      colors: Record<string, string>
    }
    dark: {
      colors: Record<string, string>
    }
  }
}

export interface LoadedMdsiteConfig {
  config: MdsiteConfig
  configPath?: string
  contentDir: string
}

const configFileName = 'mdsite.yml';

const defaultLightColors = {
  primary: '#0969da',
  secondary: '#656d76',
  selected: '#dbe3eb',
  error: '#d1242f',
  warning: '#bf8700',
  info: '#0969da',
  success: '#1a7f37',
  background: '#f6f8fa',
  surface: '#ffffff',
  'surface-rail': '#edf1f5',
  'surface-appbar': '#e4eaf0',
  'on-surface-rail': '#32302a',
  'on-surface-appbar': '#000000',
  'on-background': '#24292f',
  'on-surface': '#24292f',
  'on-primary': '#ffffff',
  'on-secondary': '#ffffff',
  'on-selectable': '#24292f',
  'on-selected': '#000000',
  'on-error': '#ffffff',
  'on-warning': '#ffffff',
  'on-info': '#ffffff',
  'on-success': '#ffffff',
  outline: '#d0d7de',
  'outline-bars': '#f3f4f6'
} satisfies Record<string, string>;

const defaultDarkColors = {
  primary: '#58a6ff',
  secondary: '#8b949e',
  selected: '#313943',
  error: '#f85149',
  warning: '#d29922',
  info: '#58a6ff',
  success: '#3fb950',
  background: '#161b22',
  surface: '#0d1117',
  'surface-rail': '#1f252d',
  'surface-appbar': '#282f38',
  'on-surface-rail': '#ced0d6',
  'on-surface-appbar': '#ffffff',
  'on-background': '#c9d1d9',
  'on-surface': '#c9d1d9',
  'on-primary': '#0d1117',
  'on-secondary': '#0d1117',
  'on-selectable': '#c9d1d9',
  'on-selected': '#ffffff',
  'on-error': '#ffffff',
  'on-warning': '#ffffff',
  'on-info': '#ffffff',
  'on-success': '#ffffff',
  outline: '#30363d',
  'outline-bars': '#161b22'
} satisfies Record<string, string>;

export function loadMdsiteConfigSync(options: {
  configPath?: string
  contentPath?: string
  searchFrom?: string
} = {}): LoadedMdsiteConfig {
  const configPath = resolveMdsiteConfigPath(options);

  if (!configPath) {
    const contentDir = resolveContentDir(options, configPath);
    return {
      config: createDefaultMdsiteConfig(path.basename(contentDir) || 'Site'),
      contentDir
    };
  }

  const rawText = fs.readFileSync(configPath, 'utf8');
  const parsed = YAML.parse(rawText) ?? {};
  const contentDir = resolveContentDir(options, configPath, parsed);

  return {
    config: normalizeMdsiteConfig(parsed, contentDir),
    configPath,
    contentDir
  };
}

export function resolveMdsiteConfigPath(options: {
  configPath?: string
  contentPath?: string
  searchFrom?: string
} = {}): string | undefined {
  const candidates = [
    options.configPath,
    process.env.MDSITE_CONFIG_PATH,
    options.contentPath ? path.join(options.contentPath, configFileName) : undefined,
    process.env.NUXT_CONTENT_PATH ? path.join(process.env.NUXT_CONTENT_PATH, configFileName) : undefined,
    options.searchFrom ? path.join(options.searchFrom, configFileName) : undefined,
    path.join(process.cwd(), configFileName)
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    const resolvedPath = path.resolve(candidate);
    if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      return resolvedPath;
    }
  }

  return undefined;
}

export function resolveContentDir(options: {
  configPath?: string
  contentPath?: string
  searchFrom?: string
} = {}, resolvedConfigPath?: string, rawConfig: Record<string, any> = {}): string {
  if (options.contentPath) {
    return path.resolve(options.contentPath);
  }

  if (process.env.NUXT_CONTENT_PATH) {
    return path.resolve(process.env.NUXT_CONTENT_PATH);
  }

  if (resolvedConfigPath) {
    const configDir = path.dirname(resolvedConfigPath);
    const inputPath = resolveInputConfigPath(rawConfig.paths?.input);
    return inputPath ? path.resolve(configDir, inputPath) : configDir;
  }

  if (options.searchFrom) {
    return path.resolve(options.searchFrom);
  }

  return process.cwd();
}

/**
 * Extract the content path from `paths.input`. Returns undefined when no
 * usable path is configured.
 */
function resolveInputConfigPath(rawInput: unknown): string | undefined {
  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (rawInput && typeof rawInput === 'object' && typeof (rawInput as { path?: unknown }).path === 'string') {
    return (rawInput as { path: string }).path;
  }

  return undefined;
}

/**
 * Runtime type-guard for entries inside the `footer:` YAML list. Accepts:
 *   - non-empty strings (file names / external URLs)
 *   - `null` (separator)
 *   - single-key objects whose value is a string or `null`
 * Drops anything else silently to stay backwards-compatible with malformed
 * user input; the CLI mirrors this filter.
 */
function isValidFooterItem(item: unknown): item is MdsiteFooterItem {
  if (item === null) return true
  if (typeof item === 'string') return item.trim().length > 0
  if (typeof item === 'object') {
    const keys = Object.keys(item as Record<string, unknown>)
    if (keys.length !== 1) return false
    const value = (item as Record<string, unknown>)[keys[0]!]
    return value === null || typeof value === 'string'
  }
  return false
}

function createDefaultMdsiteConfig(siteName: string): MdsiteConfig {
  return {
    features: {
      bibleTooltips: true,
      sourceEdit: '',
      footer: []
    },
    menu: [],
    paths: {
      ignore: [],
      input: '',
      build: '.mdsite',
      output: '.output'
    },
    site: {
      canonical: '',
      favicon: '',
      name: siteName
    },
    themes: {
      light: {
        colors: defaultLightColors
      },
      dark: {
        colors: defaultDarkColors
      }
    }
  };
}

function normalizeMdsiteConfig(rawConfig: Record<string, any>, contentDir: string): MdsiteConfig {
  const fallbackConfig = createDefaultMdsiteConfig(path.basename(contentDir) || 'Site');
  const inputPath = resolveInputConfigPath(rawConfig.paths?.input);

  return {
    features: {
      bibleTooltips: rawConfig.features?.['bible-tooltips'] ?? fallbackConfig.features.bibleTooltips,
      sourceEdit: typeof rawConfig.features?.['source-edit'] === 'string'
        ? rawConfig.features['source-edit']
        : fallbackConfig.features.sourceEdit,
      footer: Array.isArray(rawConfig.features?.footer)
        ? rawConfig.features.footer.filter(isValidFooterItem)
        : fallbackConfig.features.footer
    },
    menu: Array.isArray(rawConfig.menu) ? rawConfig.menu : fallbackConfig.menu,
    paths: {
      ignore: typeof rawConfig.paths?.ignore === 'string' || Array.isArray(rawConfig.paths?.ignore)
        ? rawConfig.paths.ignore
        : fallbackConfig.paths.ignore,
      input: inputPath ?? fallbackConfig.paths.input,
      build: typeof rawConfig.paths?.build === 'string' ? rawConfig.paths.build : fallbackConfig.paths.build,
      output: typeof rawConfig.paths?.output === 'string' ? rawConfig.paths.output : fallbackConfig.paths.output
    },
    site: {
      canonical: typeof rawConfig.site?.canonical === 'string' ? rawConfig.site.canonical : fallbackConfig.site.canonical,
      favicon: typeof rawConfig.site?.favicon === 'string' ? rawConfig.site.favicon : fallbackConfig.site.favicon,
      name: typeof rawConfig.site?.name === 'string' && rawConfig.site.name.trim() ? rawConfig.site.name : fallbackConfig.site.name
    },
    themes: {
      light: {
        colors: {
          ...fallbackConfig.themes.light.colors,
          ...(rawConfig.themes?.light?.colors ?? {})
        }
      },
      dark: {
        colors: {
          ...fallbackConfig.themes.dark.colors,
          ...(rawConfig.themes?.dark?.colors ?? {})
        }
      }
    }
  };
}
