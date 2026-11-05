import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface NuxtConfigSubset {
  content?: { build?: { markdown?: { markdownImageCacheKey?: string } } }
  hooks?: {
    'content:file:afterParse'?: (ctx: { file: { id: string }, content: { body: unknown } }) => void
  }
  vite?: {
    optimizeDeps?: {
      include?: string[]
    }
  }
}

const {
  defineNuxtConfigMock,
  loadMdsiteConfigSyncMock,
} = vi.hoisted(() => ({
  defineNuxtConfigMock: vi.fn((config: NuxtConfigSubset) => config),
  loadMdsiteConfigSyncMock: vi.fn(),
}))

vi.mock('../app/config/themes', () => ({
  buildDarkOverrideCss: vi.fn(() => ''),
  getDomainThemes: vi.fn(() => ({})),
}))

vi.mock('../app/utils/bible-wrap', () => ({
  isInExcludedContext: vi.fn(() => false),
  wrapBibleReferences: vi.fn((content: string) => content),
}))

vi.mock('./renderer-hooks', () => ({
  runBuildFallbackHooks: vi.fn(),
}))

vi.mock('../utils/base-url', () => ({
  withBasePath: vi.fn((url: string) => url),
}))

vi.mock('../utils/mdsite-config', () => ({
  loadMdsiteConfigSync: loadMdsiteConfigSyncMock,
}))

describe('Nuxt config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubGlobal('defineNuxtConfig', defineNuxtConfigMock)
    loadMdsiteConfigSyncMock.mockReturnValue({
      config: { features: {} },
      contentDir: '/content',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('pre-bundles dependencies discovered through dynamic client imports', async () => {
    await import('../nuxt.config')

    const config = defineNuxtConfigMock.mock.calls[0]?.[0]
    expect(config?.vite?.optimizeDeps?.include).toEqual([
      '@vue/devtools-core',
      '@vue/devtools-kit',
      'mermaid',
    ])
  })

  it('rewrites parsed Markdown images even when Bible tooltips are disabled', async () => {
    vi.stubEnv('NUXT_APP_BASE_URL', '/site/')
    await import('../nuxt.config')
    const config = defineNuxtConfigMock.mock.calls[0]?.[0]
    const body = { type: 'minimark', value: [['p', {}, ['img', { src: 'creator.manuscript.webp' }]]] }
    config?.hooks?.['content:file:afterParse']?.({ file: { id: 'content/divine/creator.md' }, content: { body } })
    expect(body.value[0]?.[2]).toEqual(['img', { src: '/site/divine/creator.manuscript.webp' }])
    expect(config?.content?.build?.markdown?.markdownImageCacheKey).toBe('1:/site/')
  })
})
