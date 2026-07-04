// https://nuxt.com/docs/api/configuration/nuxt-config
import path from 'path'
import { buildDarkOverrideCss, getDomainThemes } from './app/config/themes'
import { createBibleReferencePatterns } from './app/utils/bible-book-names'
import { runBuildFallbackHooks } from './scripts/renderer-hooks'
import { withBasePath } from './utils/base-url'
import { loadMdsiteConfigSync } from './utils/mdsite-config'

const mdsite = loadMdsiteConfigSync()
const siteConfig = mdsite.config
const appBaseURL = process.env.NUXT_APP_BASE_URL || '/'
// The git repo root, used by `useSourceEdit` to compute the
// repo-relative path to a content file (so the Edit-on-GitHub URL
// points at `…/blob/<branch>/<subdir>/<file>.md` rather than a
// cwd-relative or absolute filesystem path). We default to the
// directory containing `mdsite.yml` because that is the conventional
// git root for an mdsite content dir; falling back to the content
// dir itself covers the case where `mdsite.yml` is missing (legacy
// `content.config.yml` layouts loaded through `renderer-hooks`).
const contentGitPath = mdsite.configPath
  ? path.dirname(mdsite.configPath)
  : mdsite.contentDir

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  runtimeConfig: {
    public: {
      contentDomain: path.basename(mdsite.contentDir),
      contentPath: mdsite.contentDir,
      contentGitPath,
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
    preset: 'static'  // Pure static preset - no SPA fallbacks
  },

  ssr: true,

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

      const excludedContexts = ['```', '~~~', '<code', '<pre', '<a ']

      // Check if we're inside excluded context
      const isInExcludedContext = (text: string, index: number): boolean => {
        const before = text.substring(0, index)

        // Check for code blocks
        const codeBlockCount = (before.match(/```/g) || []).length
        if (codeBlockCount % 2 === 1) return true

        // Check for inline code blocks - count backticks in the current line
        const lastNewline = before.lastIndexOf('\n')
        const currentLine = lastNewline === -1 ? before : before.substring(lastNewline + 1)
        const backtickCount = (currentLine.match(/`/g) || []).length
        if (backtickCount % 2 === 1) return true

        // Check for links - rough check for [text](url) format
        const lastOpenBracket = before.lastIndexOf('[')
        const lastCloseBracket = before.lastIndexOf(']')
        if (lastOpenBracket > lastCloseBracket) return true

        return false
      }

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

      const patterns = createBibleReferencePatterns()

      // Process each pattern
      patterns.forEach(pattern => {
        const matches: Array<{ index: number; text: string }> = []

        let match
        while ((match = pattern.exec(file.body)) !== null) {
          if (!isInExcludedContext(file.body, match.index)) {
            matches.push({
              index: match.index,
              text: match[0]
            })
          }
        }
        pattern.lastIndex = 0

        // Replace matches in reverse order to preserve indices
        matches.reverse().forEach(({ index, text }) => {
          const before = file.body.substring(0, index)
          const after = file.body.substring(index + text.length)
          const wrapped = `<span class="bible-ref" data-reference="${text}">${text}</span>`
          file.body = before + wrapped + after
        })
      })
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
