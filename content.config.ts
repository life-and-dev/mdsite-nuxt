import { defineCollection, defineContentConfig } from '@nuxt/content'
import { createContentIgnore, toNuxtExcludes } from './utils/content-ignore.js'
import { loadMdsiteConfigSync } from './utils/mdsite-config.js'

const { config, contentDir } = loadMdsiteConfigSync()
const configuredExcludes = toNuxtExcludes(createContentIgnore(config.paths.ignore))

/**
 * Build/dependency directories that should never be crawled as content.
 *
 * @nuxt/content v3 does not exclude `node_modules` or hidden directories
 * by default (it passes `dot: true` to all glob/match calls), so a
 * content directory that happens to be the project root (i.e. `mdsite.yml`
 * lives at the repo root and `paths.input` is unset) would otherwise
 * walk into the renderer working dir (`.mdsite/`), its `node_modules`,
 * and other build artifacts.
 *
 * The rule mirrors `isExcludedSourceDir` in `scripts/generate-indices.ts`
 * and `scripts/sync-content.ts`: any hidden directory (name starts with
 * `.`) plus `node_modules` and `dist`. Keep the three lists in sync.
 */
const excludedSourcePatterns: readonly string[] = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.*/**'
]

export default defineContentConfig({
  collections: {
    content: defineCollection({
      type: 'page',
      source: {
        cwd: contentDir,
        include: '**/*.md',
        exclude: [...excludedSourcePatterns, '**/*.draft.md', ...configuredExcludes],
        prefix: '/'
      }
    })
  }
})
