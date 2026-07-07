#!/usr/bin/env node

import sharp from 'sharp'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'node:url'
import { loadMdsiteConfigSync, resolveMdsiteConfigPath, type MdsiteConfig } from '../utils/mdsite-config.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const FAVICON_SIZES = {
  ico: [16, 32],
  appleTouchIcon: 180,
  pwaIcon192: 192,
  pwaIcon512: 512
} as const

const DEFAULT_MONOGRAM_BG = '#0969da'
const DEFAULT_MONOGRAM_FG = '#ffffff'

export type ResolvedFaviconSource =
  | { kind: 'file'; sourcePath: string }
  | { kind: 'monogram' }

export function resolveFaviconSource(
  contentDir: string,
  favicon: string,
  configDir?: string,
): ResolvedFaviconSource {
  if (typeof favicon === 'string' && favicon.trim().length > 0) {
    // 1. Relative to the input dir (contentDir) — what `mdsite init` writes.
    const inContentDir = path.resolve(contentDir, favicon)
    if (fs.pathExistsSync(inContentDir)) {
      return { kind: 'file', sourcePath: inContentDir }
    }
    // 2. Relative to the config dir (project root, where mdsite.yml lives) —
    //    consistent with how paths.input/build/output resolve; supports
    //    hand-written paths like "docs/favicon.png".
    if (configDir) {
      const inConfigDir = path.resolve(configDir, favicon)
      if (fs.pathExistsSync(inConfigDir)) {
        return { kind: 'file', sourcePath: inConfigDir }
      }
    }
  }

  return { kind: 'monogram' }
}

export function buildMonogramSvg(
  siteName: string,
  bgColor: string,
  fgColor: string = DEFAULT_MONOGRAM_FG,
): string {
  const letterMatch = siteName.trim().match(/[A-Za-z0-9]/)
  const letter = letterMatch ? letterMatch[0].toUpperCase() : 'M'
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">' +
    `<rect width="512" height="512" rx="96" fill="${bgColor}"/>` +
    `<text x="256" y="256" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-size="300" font-weight="700" fill="${fgColor}" text-anchor="middle" dominant-baseline="central">${letter}</text>` +
    '</svg>'
  )
}

export interface GenerateFaviconsOptions {
  contentDir?: string
  config?: {
    site?: { favicon?: string; name?: string }
    themes?: { light?: { colors?: { primary?: string; 'on-primary'?: string } } }
  }
  configPath?: string
  outputDir?: string
}

/**
 * Generate favicons from the active mdsite config
 */
export async function generateFavicons(options: GenerateFaviconsOptions = {}): Promise<boolean> {
  const resolved = options.contentDir && options.config
    ? { contentDir: options.contentDir, config: options.config, configPath: options.configPath }
    : loadMdsiteConfigSync()
  const { contentDir, config, configPath } = resolved
  const siteName = config.site?.name ?? 'site'
  const favicon = config.site?.favicon ?? ''
  const configDir = configPath ? path.dirname(configPath) : undefined

  const resolvedSource = resolveFaviconSource(contentDir, favicon, configDir)

  if (resolvedSource.kind === 'monogram' && favicon.trim().length > 0) {
    const tried = [path.resolve(contentDir, favicon)]
    if (configDir) tried.push(path.resolve(configDir, favicon))
    console.warn(`⚠️ Configured favicon "${favicon}" not found (tried: ${tried.join(', ')}). Falling back to monogram.`)
  }

  const publicDir = options.outputDir ?? path.resolve(__dirname, '..', 'public')
  await fs.ensureDir(publicDir)

  let svgBuffer: Buffer

  if (resolvedSource.kind === 'file') {
    const { sourcePath } = resolvedSource
    console.log(`🎨 Generating favicons for site: ${siteName}`)
    console.log(`   Source: ${sourcePath}`)
    console.log(`   Output: ${publicDir}`)
    svgBuffer = await fs.readFile(sourcePath)
  } else {
    const bgColor = config.themes?.light?.colors?.primary ?? DEFAULT_MONOGRAM_BG
    const fgColor = config.themes?.light?.colors?.['on-primary'] ?? DEFAULT_MONOGRAM_FG
    const svgString = buildMonogramSvg(siteName, bgColor, fgColor)
    console.log(`🎨 Generating favicons for site: ${siteName}`)
    console.log(`ℹ️ No favicon configured — generating monogram from site name "${siteName}".`)
    console.log(`   Output: ${publicDir}`)
    svgBuffer = Buffer.from(svgString, 'utf8')
  }

  try {
    // Copy SVG as-is (for modern browsers)
    const svgTargetPath = path.join(publicDir, 'favicon.svg')
    await fs.writeFile(svgTargetPath, svgBuffer)
    console.log(`   ✓ SVG: favicon.svg`)

    // Generate ICO (32x32 with transparent padding)
    const icoTargetPath = path.join(publicDir, 'favicon.ico')
    const png32Buffer = await sharp(svgBuffer)
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
    await sharp(svgBuffer)
      .resize(FAVICON_SIZES.appleTouchIcon, FAVICON_SIZES.appleTouchIcon, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(appleTouchPath)
    console.log(`   ✓ Apple Touch Icon: apple-touch-icon.png`)

    // Generate PWA Icon 192x192
    const icon192Path = path.join(publicDir, 'icon-192.png')
    await sharp(svgBuffer)
      .resize(FAVICON_SIZES.pwaIcon192, FAVICON_SIZES.pwaIcon192, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(icon192Path)
    console.log(`   ✓ PWA Icon 192: icon-192.png`)

    // Generate PWA Icon 512x512
    const icon512Path = path.join(publicDir, 'icon-512.png')
    await sharp(svgBuffer)
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

export interface GenerateWebManifestOptions {
  name?: string
  themes?: MdsiteConfig['themes']
  outputDir?: string
}

/**
 * Generate web manifest for PWA support.
 * Theme/background colors are taken from the light theme in mdsite.yml
 * to match the existing `<meta name="theme-color" media="(prefers-color-scheme: light)">` tag.
 * The web manifest spec only supports a single `theme_color`, so light values are used.
 */
export async function generateWebManifest(options: GenerateWebManifestOptions = {}): Promise<void> {
  const siteName = options.name ?? 'site'
  const themeColor = options.themes?.light?.colors?.primary ?? '#000000'
  const backgroundColor = options.themes?.light?.colors?.surface ?? '#ffffff'

  const outputDir = options.outputDir ?? path.resolve(__dirname, '..', 'public')
  await fs.ensureDir(outputDir)
  const manifestPath = path.join(outputDir, 'site.webmanifest')

  const manifest = {
    name: siteName,
    short_name: siteName,
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
    theme_color: themeColor,
    background_color: backgroundColor,
    display: 'standalone'
  }

  await fs.writeJson(manifestPath, manifest, { spaces: 2 })
  console.log(`📱 Web manifest generated: site.webmanifest (theme_color=${themeColor})\n`)
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
        await generateWebManifest({ name: config.site.name, themes: config.themes })
      } else {
        process.exit(1)
      }
    })()
}
