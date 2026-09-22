import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface NuxtConfigSubset {
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
})
