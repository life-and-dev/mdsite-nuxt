// https://nuxt.com/docs/api/configuration/nuxt-config
import path from 'path'
import { buildDarkOverrideCss, getDomainThemes } from './app/config/themes'
import { isInExcludedContext, wrapBibleReferences } from './app/utils/bible-wrap'
import { runBuildFallbackHooks } from './scripts/renderer-hooks'
import { withBasePath } from './utils/base-url'
import { loadMdsiteConfigSync } from './utils/mdsite-config'

const mdsite = loadMdsiteConfigSync()
const siteConfig = mdsite.config
const appBaseURL = process.env.NUXT_APP_BASE_URL || '/'

// mdsite is a static site generator. SSR is only needed at build time so
// `nuxi generate` can pre-render every route to HTML. In `dev` and
// `preview` mode SSR uses a per-request fork worker that pulls the full
// Nuxt + Vuetify + @nuxt/content + mermaid + sharp pipeline and OOMs
// (Worker terminated … JS heap out of memory) on memory-constrained
// hosts. Keep SSR on for build/generate, off for dev/preview so the
// dev server renders client-side only and `mdsite generate` still
// produces per-route static HTML.
const isSsrNuxtCommand = process.argv.includes('build') || process.argv.includes('generate')
const ssrEnabled = isSsrNuxtCommand

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  runtimeConfig: {
    public: {
      contentDomain: path.basename(mdsite.contentDir),
      contentPath: mdsite.contentDir,
      // `mdsite.config` is a valid `MdsiteConfig` at runtime, but
      // Nuxt's runtime-config type generator collapses every complex
      // field of `siteConfig` to a degenerate shape — `menu` becomes
      // `Array<{}>` (regardless of whether the source type is recursive
      // or contains `Array<any>`) and `footer` becomes `Array<any>`.
      // We verified this by:
      //   1. Tightening `MdsiteConfig.menu` to a proper recursive
      //      `MdsiteMenuItem` (no `any`) and clearing `.nuxt` cache:
      //      the generated `menu` was still `Array<{}>`.
      //   2. Trying `declare module 'nuxt/schema'` augmentations of
      //      `PublicRuntimeConfig.siteConfig`: the augmentation
      //      *intersects* with the broken generated type rather than
      //      overriding it, producing an even narrower target.
      // Since the runtime value is unchanged, `as any` is the most
      // honest pragmatic escape hatch. The recursive `MdsiteMenuItem`
      // type is still useful: it gives the rest of the codebase
      // (notably `scripts/generate-indices.ts`) a single source of
      // truth and proper types.
      siteConfig: siteConfig as any
    }
  },

  typescript: {
    strict: true,
    typeCheck: false
  },

  nitro: {
    preset: 'static',  // Pure static preset - no SPA fallbacks
    // The `mdsite` CLI sets `MDSITE_NITRO_OUTPUT_DIR` in dev mode so the
    // build output lands in the content directory's `<paths.build>/.output/`
    // rather than inside the renderer source (e.g. the `mdsite-nuxt/`
    // submodule). The default `.output` is kept for direct use of the
    // renderer (e.g. running `nuxt generate` by hand for renderer dev).
    output: {
      dir: process.env.MDSITE_NITRO_OUTPUT_DIR || '.output'
    }
  },

  ssr: ssrEnabled,

  css: [
    '~/assets/css/markdown.css',
    '~/assets/css/print.css',
    '~/assets/css/bible-tooltips.css'
  ],

  modules: [
    'vuetify-nuxt-module',
    '@nuxt/content'
  ],

  content: {},

  vite: {
    build: {
      // EXPECTED BUILD WARNING — safe to ignore:
      // Nuxt emits `[plugin nuxt:module-preload-polyfill] Sourcemap is likely
      // to be incorrect: a plugin (nuxt:module-preload-polyfill) was used to
      // transform files, but didn't generate a sourcemap for the transformation.`
      // during `nuxi generate`. This is expected and cosmetic: the
      // module-preload-polyfill plugin transforms output without emitting a
      // sourcemap, which only affects source-map accuracy in dev tooling. The
      // generated `.output/` static assets are correct. There is no clean
      // config knob to silence it; suppressing it risks masking real future
      // Node-in-browser bugs, so we leave it.
      // Raise the default 500 kB limit so the baseline Nuxt bundle doesn't trip a noisy "chunks larger than 500 kB" warning during `mdsite generate`.
      chunkSizeWarningLimit: 1000,
      // Disable esbuild CSS minify because it drops semicolons from nested Vuetify @layer rules, causing noisy warnings.
      cssMinify: false,
      rollupOptions: {
        external: ['fs/promises', 'path']
      }
    }
  },

  app: {
    baseURL: appBaseURL,
    head: {
      style: [
        { innerHTML: buildDarkOverrideCss() }
      ],
      script: [
        {
          tagPosition: 'head',
          tagPriority: 'critical',
          innerHTML: `(function(){try{var t=localStorage.getItem('theme-preference');if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}document.documentElement.setAttribute('data-mdsite-theme',t);document.documentElement.classList.toggle('dark',t==='dark');}catch(e){document.documentElement.setAttribute('data-mdsite-theme','light');document.documentElement.classList.remove('dark');}})();`
        }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: withBasePath('/favicon.svg', appBaseURL), sizes: 'any' },
        { rel: 'icon', type: 'image/x-icon', href: withBasePath('/favicon.ico', appBaseURL), sizes: '32x32' },
        { rel: 'apple-touch-icon', href: withBasePath('/apple-touch-icon.png', appBaseURL) },
        { rel: 'manifest', href: withBasePath('/site.webmanifest', appBaseURL) },
        { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;700&display=swap' }
      ]
    }
  },

  hooks: {
    // Wrap Bible verses in spans BEFORE markdown is parsed to AST
    // This prevents hydration mismatch by ensuring server and client HTML match
    'content:file:beforeParse': (ctx: { file: any }) => {
      const { file } = ctx
      if (!file.id.endsWith('.md')) return

      // Process GFM Alerts (> [!NOTE])
      const alertPattern = /^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*(?:\n>.*)*)/gm
      file.body = file.body.replace(alertPattern, (match: any, type: string, content: string, offset: number) => {
        if (isInExcludedContext(file.body, offset)) return match

        const cleanContent = content.split('\n')
          .map((line: string) => line.replace(/^>\s?/, ''))
          .join('\n')
        return `::markdown-alert{type="${type.toLowerCase()}"}\n${cleanContent.trim()}\n::\n`
      })

      const enableBibleTooltips = siteConfig.features?.bibleTooltips ?? false

      if (!enableBibleTooltips) return

      console.log('📖 Processing Bible verses in:', file.id)

      file.body = wrapBibleReferences(file.body)
    },

    'build:before': async () => {
      if (process.argv.includes('prepare') || !mdsite.configPath) {
        return
      }

      await runBuildFallbackHooks(siteConfig)
    }
  },

  vuetify: {
    vuetifyOptions: {
      theme: {
        themes: getDomainThemes(process.env.CONTENT)
      },
      // Minimal component defaults - MD3 compliant
      defaults: {
        // Form Controls
        VTextField: {
          rounded: 'pill',
          variant: 'outlined',
          hideDetails: 'auto',
        },
        VTextarea: {
          variant: 'outlined',
          hideDetails: 'auto'
        },
        VSelect: {
          variant: 'outlined',
          hideDetails: 'auto'
        },
        VCheckbox: {
          color: 'primary',
          hideDetails: 'auto'
        },
        VRadioGroup: {
          density: 'compact'
        },

        // Layout Components
        VCard: {
          color: 'surface',
          elevation: 0,
          rounded: 'xl',
          variant: 'flat'
        },
        VCardActions: {
          class: 'justify-end pa-4'
        },

        // Interactive Components
        VBtn: {
          variant: 'flat',
          rounded: 'pill',
          elevation: 0,
          color: 'primary',
          class: 'transition-all'
        },
        'VBtn[color="secondary"]': {
          variant: 'outlined'
        },
        VDataTable: {
          variant: 'outlined',
          itemsPerPage: 25,
          showSelect: false
        },
        VDialog: {
          maxWidth: '600px',
          elevation: 24
        },
        VAlert: {
          variant: 'tonal'
        },

        // Navigation Components
        VTabs: {
          color: 'primary'
        },
        VAppBar: {
          elevation: 1,
          color: 'surface-appbar'
        },
        VNavigationDrawer: {
          elevation: 12,
          color: 'surface-rail',
          style: 'z-index: 1010;'
        },

        // Additional Components
        VChip: {
          variant: 'flat'
        },
        VSwitch: {
          color: 'primary',
          hideDetails: 'auto'
        },
        VListItem: {
          color: 'secondary'
        },
        VMenu: {
          elevation: 8
        }
      }
    }
  }
})
