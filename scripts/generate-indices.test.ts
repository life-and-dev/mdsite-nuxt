import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { generateNavigationJson, generateSearchIndexJson, generateFooterJson } from './generate-indices.js'

describe('generated content indices', () => {
  const originalEnv = { ...process.env }
  let tempDir: string
  let contentDir: string
  let publicDir: string

  beforeEach(async () => {
    process.env = { ...originalEnv }
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdsite-indices-'))
    contentDir = path.join(tempDir, 'content')
    publicDir = path.join(tempDir, 'public')
    await fs.mkdir(contentDir, { recursive: true })
    process.env.CONTENT_DIR = contentDir
    process.env.MDSITE_PUBLIC_DIR = publicDir
  })

  afterEach(async () => {
    process.env = { ...originalEnv }
    await fs.rm(tempDir, { force: true, recursive: true })
  })

  it('falls back to markdown files when no menu exists', async () => {
    await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome home.', 'utf8')
    await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nUseful guide.', 'utf8')

    await generateNavigationJson()

    const navigation = JSON.parse(await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8'))
    expect(navigation).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/', title: 'Home' }),
      expect.objectContaining({ path: '/guide', title: 'Guide' }),
    ]))
  })

  it('writes searchable markdown pages with excerpts', async () => {
    await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nUseful guide content for search.', 'utf8')

    await generateSearchIndexJson()

    const searchIndex = JSON.parse(await fs.readFile(path.join(publicDir, '_search-index.json'), 'utf8'))
    expect(searchIndex).toEqual([
      expect.objectContaining({
        excerpt: 'Useful guide content for search.',
        path: '/guide',
        title: 'Guide',
      }),
    ])
  })

  describe('index path normalization in navigation', () => {
    async function readNavigation() {
      return JSON.parse(await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8'))
    }

    it('normalizes top-level string "index" to path "/"', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome.', 'utf8')
      await fs.writeFile(path.join(contentDir, '_menu.yml'), '- index\n- guide\n', 'utf8')
      await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nContent.', 'utf8')

      await generateNavigationJson()

      const navigation = await readNavigation()
      const home = navigation.find((n: { path: string }) => n.path === '/')
      expect(home).toBeDefined()
      expect(home).toEqual(expect.objectContaining({ path: '/', title: 'Home' }))
      // No node should still have /index after normalization
      const leaked = navigation.find((n: { path: string }) => n.path === '/index')
      expect(leaked).toBeUndefined()
    })

    it('preserves non-index paths', async () => {
      await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nContent.', 'utf8')
      await fs.writeFile(path.join(contentDir, '_menu.yml'), '- guide\n', 'utf8')

      await generateNavigationJson()

      const navigation = await readNavigation()
      expect(navigation).toEqual([
        expect.objectContaining({ path: '/guide', title: 'Guide' }),
      ])
    })

    it('normalizes submenu key "index" to path "/"', async () => {
      await fs.mkdir(path.join(contentDir, 'features'), { recursive: true })
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'features', 'index.md'), '# Features Landing\n\nOverview.', 'utf8')
      await fs.writeFile(path.join(contentDir, '_menu.yml'), [
        '- index:',
        '    - features/bible-tooltips',
        '- features:',
        '    - index',
        '    - features/source-edit',
        '',
      ].join('\n'), 'utf8')
      await fs.writeFile(path.join(contentDir, 'features', 'bible-tooltips.md'), '# Bible Tooltips\n\nContent.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'features', 'source-edit.md'), '# Source Edit\n\nContent.', 'utf8')

      await generateNavigationJson()

      const navigation = await readNavigation()
      // Top-level "index:" submenu key -> "/"
      const topIndex = navigation.find((n: { path: string, children?: unknown[] }) => n.path === '/')
      expect(topIndex).toBeDefined()
      expect(Array.isArray(topIndex!.children)).toBe(true)
      // Nested "index" under features submenu -> "/features"
      const featuresNode = navigation.find((n: { path: string, children?: unknown[] }) => n.path === '/features')
      expect(featuresNode).toBeDefined()
      const nestedIndex = featuresNode!.children!.find((c: { path: string }) => c.path === '/features')
      expect(nestedIndex).toBeDefined()
    })

    it('normalizes alias (custom title) targeting "index" to path "/"', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome.', 'utf8')
      await fs.writeFile(path.join(contentDir, '_menu.yml'), '- Homepage: index\n', 'utf8')

      await generateNavigationJson()

      const navigation = await readNavigation()
      const alias = navigation.find((n: { title: string, path: string }) => n.title === 'Homepage')
      expect(alias).toEqual(expect.objectContaining({ path: '/', title: 'Homepage' }))
    })
  })

  describe('mdsite.yml menu lookup', () => {
    async function readNavigation() {
      return JSON.parse(await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8'))
    }

    it('reads menu from MDSITE_CONFIG_PATH when it points to a mdsite.yml', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome home.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nUseful guide.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'about.md'), '# About\n\nAbout us.', 'utf8')

      const mdsitePath = path.join(tempDir, 'mdsite.yml')
      await fs.writeFile(mdsitePath, [
        'site:',
        '  name: Test Site',
        'menu:',
        '  - index',
        '  - guide',
        '',
      ].join('\n'), 'utf8')
      process.env.MDSITE_CONFIG_PATH = mdsitePath

      await generateNavigationJson()

      const navigation = await readNavigation()
      expect(navigation).toEqual([
        expect.objectContaining({ path: '/', title: 'Home' }),
        expect.objectContaining({ path: '/guide', title: 'Guide' }),
      ])
      // about.md exists but is not in the menu
      expect(navigation.find((n: { path: string }) => n.path === '/about')).toBeUndefined()
    })

    it('reads menu from ../mdsite.yml relative to content dir when MDSITE_CONFIG_PATH is unset', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome home.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nUseful guide.', 'utf8')

      // mdsite.yml lives one level up from contentDir (e.g. sibling of the content dir)
      const mdsitePath = path.join(tempDir, 'mdsite.yml')
      await fs.writeFile(mdsitePath, [
        'menu:',
        '  - guide',
        '',
      ].join('\n'), 'utf8')
      delete process.env.MDSITE_CONFIG_PATH

      await generateNavigationJson()

      const navigation = await readNavigation()
      expect(navigation).toEqual([
        expect.objectContaining({ path: '/guide', title: 'Guide' }),
      ])
    })

    it('prefers _menu.yml over mdsite.yml when both exist (legacy precedence)', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nContent.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'about.md'), '# About\n\nAbout.', 'utf8')

      // Legacy _menu.yml lists only index + guide
      await fs.writeFile(path.join(contentDir, '_menu.yml'), '- index\n- guide\n', 'utf8')
      // mdsite.yml in same content dir would otherwise list index + about
      await fs.writeFile(path.join(contentDir, 'mdsite.yml'), [
        'menu:',
        '  - index',
        '  - about',
        '',
      ].join('\n'), 'utf8')
      delete process.env.MDSITE_CONFIG_PATH

      await generateNavigationJson()

      const navigation = await readNavigation()
      const paths = navigation.map((n: { path: string }) => n.path)
      expect(paths).toEqual(['/', '/guide'])
      // about.md is not in the legacy menu, so it should not appear
      expect(navigation.find((n: { path: string }) => n.path === '/about')).toBeUndefined()
    })

    it('skips mdsite.yml candidates that have no menu key and falls through to a later candidate', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nContent.', 'utf8')

      // ../mdsite.yml exists but has no menu key - should not be used
      const parentMdsite = path.join(tempDir, 'mdsite.yml')
      await fs.writeFile(parentMdsite, [
        'site:',
        '  name: Test Site',
        '',
      ].join('\n'), 'utf8')
      // contentDir/mdsite.yml has a real menu - should win as the next candidate
      await fs.writeFile(path.join(contentDir, 'mdsite.yml'), [
        'menu:',
        '  - guide',
        '',
      ].join('\n'), 'utf8')
      delete process.env.MDSITE_CONFIG_PATH

      await generateNavigationJson()

      const navigation = await readNavigation()
      expect(navigation).toEqual([
        expect.objectContaining({ path: '/guide', title: 'Guide' }),
      ])
    })
  })

  describe('mdsite.yml footer lookup', () => {
    async function readFooter() {
      return JSON.parse(await fs.readFile(path.join(publicDir, '_footer.json'), 'utf8'))
    }

    async function readNavigation() {
      return JSON.parse(await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8'))
    }

    it('generates _footer.json with paths and titles from mdsite.yml features.footer section', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome home.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'about.md'), '# About\n\nAbout us.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'contacts.md'), '# Contacts\n\nContact us.', 'utf8')

      const mdsitePath = path.join(tempDir, 'mdsite.yml')
      await fs.writeFile(mdsitePath, [
        'site:',
        '  name: Test Site',
        'features:',
        '  footer:',
        '    - about',
        '    - contacts',
        '',
      ].join('\n'), 'utf8')
      process.env.MDSITE_CONFIG_PATH = mdsitePath

      await generateFooterJson()

      const footer = await readFooter()
      expect(footer).toEqual([
        { path: '/about', title: 'About', type: 'link', isExternal: false },
        { path: '/contacts', title: 'Contacts', type: 'link', isExternal: false },
      ])
    })

    it('generates _footer.json with custom labels, external URLs, and separators', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home', 'utf8')
      await fs.writeFile(path.join(contentDir, 'about.md'), '# About', 'utf8')

      const mdsitePath = path.join(tempDir, 'mdsite.yml')
      await fs.writeFile(mdsitePath, [
        'site:',
        '  name: Test Site',
        'features:',
        '  footer:',
        '    - about',
        '    - "About Page": about',
        '    - "GitHub Repo": https://github.com/life-and-dev/mdsite',
        '    - null',
        '',
      ].join('\n'), 'utf8')
      process.env.MDSITE_CONFIG_PATH = mdsitePath

      await generateFooterJson()

      const footer = await readFooter()
      expect(footer).toEqual([
        { path: '/about', title: 'About', type: 'link', isExternal: false },
        { path: '/about', title: 'About Page', type: 'link', isExternal: false },
        { path: 'https://github.com/life-and-dev/mdsite', title: 'GitHub Repo', type: 'link', isExternal: true },
        { path: '', title: '', type: 'separator', isExternal: false },
      ])
    })

    it('returns an empty footer array when no footer section is configured', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'mdsite.yml'), [
        'site:',
        '  name: Test Site',
        '',
      ].join('\n'), 'utf8')
      process.env.MDSITE_CONFIG_PATH = path.join(contentDir, 'mdsite.yml')

      await generateFooterJson()

      const footer = await readFooter()
      expect(footer).toEqual([])
    })

    it('excludes footer entries from the navigation tree', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome home.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nUseful guide.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'about.md'), '# About\n\nAbout us.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'contacts.md'), '# Contacts\n\nContact us.', 'utf8')

      const mdsitePath = path.join(tempDir, 'mdsite.yml')
      await fs.writeFile(mdsitePath, [
        'site:',
        '  name: Test Site',
        'menu:',
        '  - index',
        '  - guide',
        'features:',
        '  footer:',
        '    - contacts',
        '',
      ].join('\n'), 'utf8')
      process.env.MDSITE_CONFIG_PATH = mdsitePath

      await generateNavigationJson()
      await generateFooterJson()

      const navigation = await readNavigation()
      const paths = navigation.map((n: { path: string }) => n.path)
      expect(paths).toContain('/')
      expect(paths).toContain('/guide')
      expect(paths).not.toContain('/contacts')

      const footer = await readFooter()
      expect(footer).toEqual([
        { path: '/contacts', title: 'Contacts', type: 'link', isExternal: false },
      ])
    })

    it('excludes custom-labelled internal footer entries from the navigation tree', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home', 'utf8')
      await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide', 'utf8')
      await fs.writeFile(path.join(contentDir, 'about.md'), '# About', 'utf8')

      const mdsitePath = path.join(tempDir, 'mdsite.yml')
      await fs.writeFile(mdsitePath, [
        'site:',
        '  name: Test Site',
        'menu:',
        '  - index',
        '  - guide',
        'features:',
        '  footer:',
        '    - "About Page": about',
        '',
      ].join('\n'), 'utf8')
      process.env.MDSITE_CONFIG_PATH = mdsitePath

      await generateNavigationJson()
      await generateFooterJson()

      const navigation = await readNavigation()
      const paths = navigation.map((n: { path: string }) => n.path)
      expect(paths).toContain('/')
      expect(paths).toContain('/guide')
      expect(paths).not.toContain('/about')
    })

    it('excludes footer entries from the fallback navigation tree', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome home.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'about.md'), '# About\n\nAbout us.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'contacts.md'), '# Contacts\n\nContact us.', 'utf8')

      const mdsitePath = path.join(tempDir, 'mdsite.yml')
      await fs.writeFile(mdsitePath, [
        'site:',
        '  name: Test Site',
        'features:',
        '  footer: [contacts]',
        '',
      ].join('\n'), 'utf8')
      delete process.env.MDSITE_CONFIG_PATH

      await generateNavigationJson()

      const navigation = await readNavigation()
      const paths = navigation.map((n: { path: string }) => n.path)
      expect(paths).toContain('/')
      expect(paths).toContain('/about')
      expect(paths).not.toContain('/contacts')
    })
  })
})
