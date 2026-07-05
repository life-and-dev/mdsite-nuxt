import fs from 'fs'
import path from 'path'

import { buildContentData } from './generate-indices.js'
import { generateFavicons, generateWebManifest } from './generate-favicons.js'
import { startWatcher, syncContent } from './sync-content.js'
import { loadMdsiteConfigSync, resolveMdsiteConfigPath, type MdsiteConfig } from '../utils/mdsite-config.js'

export interface RendererRuntime {
  config: ReturnType<typeof loadMdsiteConfigSync>['config']
  configPath: string
  contentDir: string
  rootDir: string
}

export function prepareRendererRuntime(rootDir: string, options: {
  configPath?: string
  contentPath?: string
} = {}): RendererRuntime {
  const configPath = resolveMdsiteConfigPath({
    configPath: options.configPath,
    contentPath: options.contentPath ?? process.env.NUXT_CONTENT_PATH
  })

  if (!configPath) {
    console.error('❌ No mdsite.yml configuration found. Set MDSITE_CONFIG_PATH or pass a mdsite.yml path.')
    process.exit(1)
  }

  const { config, contentDir } = loadMdsiteConfigSync({
    configPath,
    contentPath: options.contentPath ?? process.env.NUXT_CONTENT_PATH
  })

  process.env.NUXT_CONTENT_PATH = contentDir
  process.env.CONTENT_DIR = contentDir
  process.env.MDSITE_CONFIG_PATH = configPath

  console.log(`🚀 Preparing site: ${config.site.name}`)
  console.log(`📂 Content path: ${contentDir}`)
  console.log(`📑 Config file: ${configPath}`)

  if (!fs.existsSync(contentDir)) {
    console.error(`❌ Content directory not found: ${contentDir}`)
    process.exit(1)
  }

  return {
    config,
    configPath,
    contentDir,
    rootDir
  }
}

export async function runSetupHooks(mode: 'setup' | 'build' | 'generate' | 'dev', rootDir: string, options: {
  cached?: boolean
  configPath?: string
  contentPath?: string
} = {}): Promise<RendererRuntime> {
  const runtime = prepareRendererRuntime(rootDir, options)

  if (mode === 'dev') {
    if (!options.cached) {
      await fs.promises.rm(path.join(rootDir, '.data'), { recursive: true, force: true })
    }
    await generateDevManifestAssets(runtime.config)
    await startWatcher()
    return runtime
  }

  await syncContent()
  console.log(`\n🔨 Generating navigation and search index...`)
  await buildContentData()
  await generateFaviconAssets(runtime.config)

  return runtime
}

export async function runBuildFallbackHooks(config: MdsiteConfig): Promise<void> {
  console.log(`\n🔨 Generating navigation and search index...`)
  await buildContentData()
  await generateFaviconAssets(config)
}

async function generateFaviconAssets(config: MdsiteConfig): Promise<void> {
  console.log(`\n🎨 Generating favicons for build...`)
  const success = await generateFavicons()

  if (success) {
    await generateWebManifest({ name: config.site.name, themes: config.themes })
    console.log(`✅ Favicons ready for ${config.site.name}\n`)
  }
}

async function generateDevManifestAssets(config: MdsiteConfig): Promise<void> {
  await generateWebManifest({ name: config.site.name, themes: config.themes })
}
