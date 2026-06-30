#!/usr/bin/env node

import sharp from 'sharp'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { loadMdsiteConfigSync, resolveMdsiteConfigPath } from '../utils/mdsite-config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const DEFAULT_FAVICON_PATH = fileURLToPath(new URL('../assets/default-favicon.svg', import.meta.url))

const FAVICON_SIZES = {
  ico: [16, 32],
  appleTouchIcon: 180,
  pwaIcon192: 192,
  pwaIcon512: 512
} as const

export function resolveFaviconSource(
  contentDir: string,
  favicon: string,
): { sourcePath: string; isDefault: boolean } | null {
  if (typeof favicon === 'string' && favicon.trim().length > 0) {
    const candidate = path.resolve(contentDir, favicon)
    if (fs.pathExistsSync(candidate)) {
      return { sourcePath: candidate, isDefault: false }
    }
  }

  if (fs.pathExistsSync(DEFAULT_FAVICON_PATH)) {
    return { sourcePath: DEFAULT_FAVICON_PATH, isDefault: true }
  }

  return null
}

export interface GenerateFaviconsOptions {
  contentDir?: string
  config?: { favicon?: string; site?: { name?: string } }
  outputDir?: string
}

/**
 * Generate favicons from the active mdsite config
 */
export async function generateFavicons(options: GenerateFaviconsOptions = {}): Promise<boolean> {
  const resolved = options.contentDir && options.config
    ? { contentDir: options.contentDir, config: options.config }
    : loadMdsiteConfigSync()
  const { contentDir, config } = resolved
  const siteName = (config as { site?: { name?: string } }).site?.name ?? 'site'

  const resolvedSource = resolveFaviconSource(contentDir, config.favicon ?? '')

  if (!resolvedSource) {
    console.error('❌ No favicon source available (configured source missing AND bundled default not found).')
    return false
  }

  const { sourcePath } = resolvedSource
  const publicDir = options.outputDir ?? path.resolve(__dirname, '..', 'public')
  await fs.ensureDir(publicDir)

  if (resolvedSource.isDefault) {
    console.log('ℹ️ No favicon source configured (config.favicon empty or file not found). Using bundled default favicon.')
  }

  console.log(`🎨 Generating favicons for site: ${siteName}`)
  console.log(`   Source: ${sourcePath}`)
  console.log(`   Output: ${publicDir}`)

  try {
    // Copy SVG as-is (for modern browsers)
    const svgTargetPath = path.join(publicDir, 'favicon.svg')
    await fs.copy(sourcePath, svgTargetPath)
    console.log(`   ✓ SVG: favicon.svg`)

    // Generate ICO (32x32 with transparent padding)
    const icoTargetPath = path.join(publicDir, 'favicon.ico')
    const png32Buffer = await sharp(sourcePath)
      .resize(32, 32, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toBuffer()
    await fs.writeFile(icoTargetPath, png32Buffer)
    console.log(`   ✓ ICO: favicon.ico`)

    // Generate Apple Touch Icon (180x180 with transparent padding)
    const appleTouchPath = path.join(publicDir, 'apple-touch-icon.png')
    await sharp(sourcePath)
      .resize(FAVICON_SIZES.appleTouchIcon, FAVICON_SIZES.appleTouchIcon, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(appleTouchPath)
    console.log(`   ✓ Apple Touch Icon: apple-touch-icon.png`)

    // Generate PWA Icon 192x192
    const icon192Path = path.join(publicDir, 'icon-192.png')
    await sharp(sourcePath)
      .resize(FAVICON_SIZES.pwaIcon192, FAVICON_SIZES.pwaIcon192, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(icon192Path)
    console.log(`   ✓ PWA Icon 192: icon-192.png`)

    // Generate PWA Icon 512x512
    const icon512Path = path.join(publicDir, 'icon-512.png')
    await sharp(sourcePath)
      .resize(FAVICON_SIZES.pwaIcon512, FAVICON_SIZES.pwaIcon512, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(icon512Path)
    console.log(`   ✓ PWA Icon 512: icon-512.png`)

    console.log(`✅ Favicons generated successfully for ${siteName}\n`)
    return true
  } catch (error) {
    console.error(`❌ Failed to generate favicons for ${siteName}:`, error)
    return false
  }
}

/**
 * Generate web manifest for PWA support
 */
export async function generateWebManifest(name: string) {
  const projectRoot = path.resolve(__dirname, '..')
  const publicDir = path.join(projectRoot, 'public')
  const manifestPath = path.join(publicDir, 'site.webmanifest')

  const manifest = {
    name: name,
    short_name: name,
    icons: [
      {
        src: 'icon-192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: 'icon-512.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ],
    theme_color: '#ffffff',
    background_color: '#ffffff',
    display: 'standalone'
  }

  await fs.writeJson(manifestPath, manifest, { spaces: 2 })
  console.log(`📱 Web manifest generated: site.webmanifest\n`)
}

/**
 * CLI execution
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const configArg = args.find(arg => /\.ya?ml$/i.test(arg))
  const configPath = resolveMdsiteConfigPath({ configPath: configArg, contentPath: process.env.NUXT_CONTENT_PATH })

  if (!configPath) {
    console.error('❌ No mdsite.yml configuration found. Set MDSITE_CONFIG_PATH or pass a mdsite.yml path.')
    process.exit(1)
  }

  const { config, contentDir } = loadMdsiteConfigSync({ configPath, contentPath: process.env.NUXT_CONTENT_PATH })
  process.env.MDSITE_CONFIG_PATH = configPath
  process.env.NUXT_CONTENT_PATH = contentDir
  process.env.CONTENT_DIR = contentDir

    ; (async () => {
      const success = await generateFavicons()
      if (success) {
        await generateWebManifest(config.site.name)
      } else {
        process.exit(1)
      }
    })()
}
