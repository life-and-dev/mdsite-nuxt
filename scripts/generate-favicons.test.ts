import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { generateFavicons, generateWebManifest, resolveFaviconSource } from './generate-favicons.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_FAVICON_PATH = path.resolve(__dirname, '..', 'assets', 'default-favicon.svg')

describe('generate-favicons', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdsite-favicon-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('resolveFaviconSource', () => {
    it('falls back to the bundled default favicon when favicon is an empty string', () => {
      const result = resolveFaviconSource(tmpDir, '')

      expect(result).not.toBeNull()
      expect(result!.isDefault).toBe(true)
      expect(path.basename(result!.sourcePath)).toBe('default-favicon.svg')
      expect(fs.existsSync(result!.sourcePath)).toBe(true)
    })

    it('falls back to the bundled default favicon when favicon is only whitespace', () => {
      const result = resolveFaviconSource(tmpDir, '   ')

      expect(result).not.toBeNull()
      expect(result!.isDefault).toBe(true)
      expect(path.basename(result!.sourcePath)).toBe('default-favicon.svg')
    })

    it('uses the configured source when the favicon file exists under the content dir', () => {
      const relPath = 'favicon.svg'
      const absPath = path.join(tmpDir, relPath)
      const customSvg =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
        '<rect width="16" height="16" fill="red"/></svg>'
      fs.writeFileSync(absPath, customSvg, 'utf8')

      const result = resolveFaviconSource(tmpDir, relPath)

      expect(result).not.toBeNull()
      expect(result!.isDefault).toBe(false)
      expect(result!.sourcePath).toBe(path.resolve(tmpDir, relPath))
    })

    it('falls back to the bundled default favicon when the configured file does not exist', () => {
      const result = resolveFaviconSource(tmpDir, 'does-not-exist.svg')

      expect(result).not.toBeNull()
      expect(result!.isDefault).toBe(true)
      expect(path.basename(result!.sourcePath)).toBe('default-favicon.svg')
      expect(fs.existsSync(result!.sourcePath)).toBe(true)
    })
  })

  describe('generateFavicons', () => {
    it('uses the bundled default favicon and writes all expected assets when config.favicon is empty', async () => {
      const outputDir = path.join(tmpDir, 'output')

      const ok = await generateFavicons({
        contentDir: tmpDir,
        config: { favicon: '' },
        outputDir,
      })

      expect(ok).toBe(true)

      const expectedFiles = [
        'favicon.svg',
        'favicon.ico',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
      ]
      for (const file of expectedFiles) {
        const filePath = path.join(outputDir, file)
        expect(fs.existsSync(filePath)).toBe(true)
        expect(fs.statSync(filePath).size).toBeGreaterThan(0)
      }

      // The default source svg is copied verbatim as favicon.svg
      const defaultSvgContent = fs.readFileSync(DEFAULT_FAVICON_PATH, 'utf8')
      const writtenSvgContent = fs.readFileSync(path.join(outputDir, 'favicon.svg'), 'utf8')
      expect(writtenSvgContent).toBe(defaultSvgContent)
    })

    it('uses the configured custom source svg over the bundled default', async () => {
      const outputDir = path.join(tmpDir, 'output')
      const customSvg =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
        '<rect width="16" height="16" fill="blue"/></svg>'
      fs.writeFileSync(path.join(tmpDir, 'favicon.svg'), customSvg, 'utf8')

      const ok = await generateFavicons({
        contentDir: tmpDir,
        config: { favicon: 'favicon.svg' },
        outputDir,
      })

      expect(ok).toBe(true)

      const writtenSvgContent = fs.readFileSync(path.join(outputDir, 'favicon.svg'), 'utf8')
      expect(writtenSvgContent).toBe(customSvg)

      // And it is NOT the bundled default
      const defaultSvgContent = fs.readFileSync(DEFAULT_FAVICON_PATH, 'utf8')
      expect(writtenSvgContent).not.toBe(defaultSvgContent)
    })
  })

  describe('generateWebManifest', () => {
    it('writes manifest with theme colors from config when name and themes are provided', async () => {
      const outputDir = path.join(tmpDir, 'output')

      await generateWebManifest({
        name: 'My Site',
        themes: {
          light: { colors: { primary: '#abcdef', surface: '#fedcba' } },
          dark: { colors: {} },
        },
        outputDir,
      })

      const manifestPath = path.join(outputDir, 'site.webmanifest')
      expect(fs.existsSync(manifestPath)).toBe(true)
      const written = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      expect(written).toEqual({
        name: 'My Site',
        short_name: 'My Site',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
        theme_color: '#abcdef',
        background_color: '#fedcba',
        display: 'standalone',
      })
    })

    it('falls back to safe defaults when themes are missing colors', async () => {
      const outputDir = path.join(tmpDir, 'output')

      await generateWebManifest({
        name: 'No Themes',
        themes: { light: { colors: {} }, dark: { colors: {} } },
        outputDir,
      })

      const written = JSON.parse(fs.readFileSync(path.join(outputDir, 'site.webmanifest'), 'utf8'))
      expect(written.theme_color).toBe('#000000')
      expect(written.background_color).toBe('#ffffff')
    })

    it('falls back to safe defaults when themes are not provided at all', async () => {
      const outputDir = path.join(tmpDir, 'output')

      await generateWebManifest({ name: 'No Themes', outputDir })

      const written = JSON.parse(fs.readFileSync(path.join(outputDir, 'site.webmanifest'), 'utf8'))
      expect(written.theme_color).toBe('#000000')
      expect(written.background_color).toBe('#ffffff')
    })
  })
})
