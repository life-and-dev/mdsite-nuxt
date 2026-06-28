import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { generateNavigationJson, generateSearchIndexJson } from './generate-indices.js'

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
})
