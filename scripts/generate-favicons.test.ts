import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildMonogramSvg, generateFavicons, generateWebManifest, resolveFaviconSource } from './generate-favicons.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('generate-favicons', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdsite-favicon-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('resolveFaviconSource', () => {
    it('returns a monogram source when favicon is an empty string', () => {
      const result = resolveFaviconSource(tmpDir, '')

      expect(result).toEqual({ kind: 'monogram' })
    })

    it('returns a monogram source when favicon is only whitespace', () => {
      const result = resolveFaviconSource(tmpDir, '   ')

      expect(result).toEqual({ kind: 'monogram' })
    })

    it('returns a file source when the favicon file exists under the content dir', () => {
      const relPath = 'favicon.svg'
      const absPath = path.join(tmpDir, relPath)
      const customSvg =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
        '<rect width="16" height="16" fill="red"/></svg>'
      fs.writeFileSync(absPath, customSvg, 'utf8')

      const result = resolveFaviconSource(tmpDir, relPath)

      expect(result).toEqual({ kind: 'file', sourcePath: path.resolve(tmpDir, relPath) })
    })

    it('returns a monogram source when the configured file does not exist', () => {
      const result = resolveFaviconSource(tmpDir, 'does-not-exist.svg')

      expect(result).toEqual({ kind: 'monogram' })
    })

    it('resolves a favicon written relative to the config dir (project root) when not found under the content dir', () => {
      // tmpDir is the project root; tmpDir/docs is the content dir;
      // the file lives at tmpDir/docs/favicon.png (i.e. docs/favicon.png from the root).
      const contentDir = path.join(tmpDir, 'docs')
      fs.mkdirSync(contentDir, { recursive: true })
      const absPath = path.join(contentDir, 'favicon.png')
      fs.writeFileSync(absPath, 'png-bytes', 'utf8')

      const result = resolveFaviconSource(contentDir, 'docs/favicon.png', tmpDir)

      expect(result).toEqual({ kind: 'file', sourcePath: absPath })
    })

    it('prefers the content-dir resolution when the file exists under both bases', () => {
      // Both tmpDir/favicon.png (content-dir, since contentDir === tmpDir)
      // and tmpDir/favicon.png (config-dir, since configDir === tmpDir) resolve
      // to the same path; ensure content-dir wins when both candidates exist.
      const absPath = path.join(tmpDir, 'favicon.png')
      fs.writeFileSync(absPath, 'png-bytes', 'utf8')

      const result = resolveFaviconSource(tmpDir, 'favicon.png', tmpDir)

      expect(result).toEqual({ kind: 'file', sourcePath: absPath })
    })
  })

  describe('buildMonogramSvg', () => {
    it('uppercases the first alphanumeric char of the site name', () => {
      const svg = buildMonogramSvg('mdsite', '#0969da')
      expect(svg).toContain('>M<')
      expect(svg).toContain('fill="#0969da"')
      expect(svg).toContain('viewBox="0 0 512 512"')
    })

    it('skips leading non-alphanumeric characters when picking the letter', () => {
      const svg = buildMonogramSvg('   - 7 wonders', '#000000')
      expect(svg).toContain('>7<')
    })

    it('falls back to "M" when the site name is empty or whitespace', () => {
      expect(buildMonogramSvg('', '#000000')).toContain('>M<')
      expect(buildMonogramSvg('   ', '#000000')).toContain('>M<')
    })

    it('uses the provided foreground color', () => {
      const svg = buildMonogramSvg('Demo', '#112233', '#ffeedd')
      expect(svg).toContain('fill="#ffeedd"')
    })
  })

  describe('generateFavicons', () => {
    it('writes a monogram favicon.svg and all raster assets when site.favicon is empty', async () => {
      const outputDir = path.join(tmpDir, 'output')

      const ok = await generateFavicons({
        contentDir: tmpDir,
        config: { site: { favicon: '', name: 'My Docs' } },
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

      const writtenSvgContent = fs.readFileSync(path.join(outputDir, 'favicon.svg'), 'utf8')
      // The monogram for "My Docs" uses the first alphanumeric char "M", uppercased.
      expect(writtenSvgContent).toContain('<text')
      expect(writtenSvgContent).toContain('>M<')
      // Monogram default background color when no theme is configured.
      expect(writtenSvgContent).toContain('fill="#0969da"')
      // Must not leak the old bundled default favicon asset path or content.
      expect(writtenSvgContent).not.toContain('default-favicon')
      expect(writtenSvgContent).not.toContain('inkscape')
    })

    it('uses the configured primary color from themes.light.colors.primary for the monogram', async () => {
      const outputDir = path.join(tmpDir, 'output')

      const ok = await generateFavicons({
        contentDir: tmpDir,
        config: {
          site: { favicon: '', name: 'Acme' },
          themes: { light: { colors: { primary: '#ff00aa' } } },
        },
        outputDir,
      })

      expect(ok).toBe(true)
      const writtenSvgContent = fs.readFileSync(path.join(outputDir, 'favicon.svg'), 'utf8')
      expect(writtenSvgContent).toContain('fill="#ff00aa"')
      expect(writtenSvgContent).toContain('>A<')
    })

    it('uses the configured custom source svg verbatim', async () => {
      const outputDir = path.join(tmpDir, 'output')
      const customSvg =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
        '<rect width="16" height="16" fill="blue"/></svg>'
      fs.writeFileSync(path.join(tmpDir, 'favicon.svg'), customSvg, 'utf8')

      const ok = await generateFavicons({
        contentDir: tmpDir,
        config: { site: { favicon: 'favicon.svg' } },
        outputDir,
      })

      expect(ok).toBe(true)

      const writtenSvgContent = fs.readFileSync(path.join(outputDir, 'favicon.svg'), 'utf8')
      expect(writtenSvgContent).toBe(customSvg)
      // The custom user source must not be replaced with the monogram template.
      expect(writtenSvgContent).not.toContain('dominant-baseline="central"')
    })

    it('resolves a favicon written relative to the config dir (project root) via configPath', async () => {
      // tmpDir acts as the project root; tmpDir/docs is the content dir;
      // the file lives at tmpDir/docs/favicon.svg (i.e. docs/favicon.svg
      // from the root). configPath points at a dummy mdsite.yml inside
      // tmpDir so configDir is derived as tmpDir.
      const projectRoot = tmpDir
      const contentDir = path.join(projectRoot, 'docs')
      fs.mkdirSync(contentDir, { recursive: true })

      const customSvg =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">' +
        '<rect width="16" height="16" fill="green"/></svg>'
      const userFilePath = path.join(contentDir, 'favicon.svg')
      fs.writeFileSync(userFilePath, customSvg, 'utf8')

      // Dummy mdsite.yml — only its dirname (projectRoot) is consumed here.
      const configPath = path.join(projectRoot, 'mdsite.yml')
      fs.writeFileSync(configPath, '', 'utf8')

      const outputDir = path.join(projectRoot, 'output')

      const ok = await generateFavicons({
        contentDir,
        config: { site: { favicon: 'docs/favicon.svg', name: 'Docs' } },
        configPath,
        outputDir,
      })

      expect(ok).toBe(true)

      const writtenSvgContent = fs.readFileSync(path.join(outputDir, 'favicon.svg'), 'utf8')
      expect(writtenSvgContent).toBe(customSvg)
      // Must not fall back to the monogram template.
      expect(writtenSvgContent).not.toContain('dominant-baseline="central"')
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
