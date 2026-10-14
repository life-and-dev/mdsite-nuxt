import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildContentData, generateNavigationJson, generateSearchIndexJson, generateFooterJson } from './generate-indices.js'
import type { MinimalTreeNode } from './generate-indices.js'

type NavigationProjection = Omit<MinimalTreeNode, 'id' | 'description' | 'children'> & {
  children?: NavigationProjection[]
}

function flattenNavigation(nodes: MinimalTreeNode[]): MinimalTreeNode[] {
  return nodes.flatMap(node => [node, ...flattenNavigation(node.children ?? [])])
}

function projectNavigation(nodes: MinimalTreeNode[]): NavigationProjection[] {
  return nodes.map(node => ({
    path: node.path,
    title: node.title,
    type: node.type,
    isPrimary: node.isPrimary,
    ...(node.children ? { children: projectNavigation(node.children) } : {}),
  }))
}

function assertNavigationIds(nodes: MinimalTreeNode[]): string[] {
  const ids = flattenNavigation(nodes).map(node => node.id)
  expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true)
  expect(new Set(ids).size).toBe(ids.length)
  return ids
}

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

    const navigation: MinimalTreeNode[] = JSON.parse(await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8'))
    expect(navigation).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/', title: 'Home' }),
      expect.objectContaining({ path: '/guide', title: 'Guide' }),
    ]))
    const ids = assertNavigationIds(navigation)
    expect(ids).toHaveLength(2)

    await generateNavigationJson()

    const repeatedNavigation: MinimalTreeNode[] = JSON.parse(await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8'))
    expect(assertNavigationIds(repeatedNavigation)).toEqual(ids)
  })

  it('falls back to markdown files with stable unique IDs when menu is explicitly empty', async (): Promise<void> => {
    await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n', 'utf8')
    const mdsitePath = path.join(tempDir, 'mdsite.yml')
    await fs.writeFile(mdsitePath, 'menu: []\n', 'utf8')
    process.env.MDSITE_CONFIG_PATH = mdsitePath

    await generateNavigationJson()

    const navigation: MinimalTreeNode[] = JSON.parse(await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8'))
    const expectedNavigation: NavigationProjection[] = [
      { path: '/', title: 'Home', type: 'link', isPrimary: true },
    ]
    expect(projectNavigation(navigation)).toEqual(expectedNavigation)
    const ids = assertNavigationIds(navigation)

    await generateNavigationJson()

    const repeatedNavigation: MinimalTreeNode[] = JSON.parse(await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8'))
    expect(projectNavigation(repeatedNavigation)).toEqual(expectedNavigation)
    expect(assertNavigationIds(repeatedNavigation)).toEqual(ids)
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

  it('keeps default internal files out of all generated metadata', async () => {
    await fs.mkdir(path.join(contentDir, 'nested'), { recursive: true })
    await fs.writeFile(path.join(contentDir, 'AGENTS.md'), '# Agent Secret\n\nagent-only metadata', 'utf8')
    await fs.writeFile(path.join(contentDir, 'nested', 'CLAUDE.md'), '# Claude Secret\n\nclaude-only metadata', 'utf8')
    await fs.writeFile(path.join(contentDir, 'README.md'), '# Project Readme\n\nPublished readme.', 'utf8')
    await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nPublished guide.', 'utf8')
    const mdsitePath = path.join(tempDir, 'mdsite.yml')
    await fs.writeFile(mdsitePath, [
      'menu:',
      '  - AGENTS',
      '  - nested/CLAUDE',
      '  - README',
      '  - guide',
      'features:',
      '  footer: [AGENTS, guide]',
      ''
    ].join('\n'), 'utf8')
    process.env.MDSITE_CONFIG_PATH = mdsitePath

    await buildContentData()

    const navigationText = await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8')
    const searchText = await fs.readFile(path.join(publicDir, '_search-index.json'), 'utf8')
    const footerText = await fs.readFile(path.join(publicDir, '_footer.json'), 'utf8')
    const generatedMetadata = `${navigationText}\n${searchText}\n${footerText}`
    expect(generatedMetadata).not.toContain('Agent Secret')
    expect(generatedMetadata).not.toContain('Claude Secret')
    expect(generatedMetadata).not.toContain('agent-only metadata')
    expect(generatedMetadata).not.toContain('claude-only metadata')
    expect(generatedMetadata).toContain('Project Readme')
    expect(generatedMetadata).toContain('Published readme.')
    expect(generatedMetadata).toContain('Guide')
    expect(generatedMetadata).toContain('Published guide.')
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

  describe('navigation ID regression', () => {
    const expectedNavigation: NavigationProjection[] = ['a', 'b'].map(section => ({
      path: `/section-${section}`,
      title: `section-${section}`,
      type: 'link',
      isPrimary: true,
      children: [{
        path: `/section-${section}/guide`,
        title: 'guide',
        type: 'link',
        isPrimary: true,
        children: [
          {
            path: `/section-${section}/guide`,
            title: `Guide ${section.toUpperCase()}`,
            type: 'link',
            isPrimary: true,
          },
          {
            path: `/section-${section}/guide/child-${section}`,
            title: `Child ${section.toUpperCase()}`,
            type: 'link',
            isPrimary: true,
          },
          {
            path: `/section-${section}/guide/child-${section}`,
            title: `Child ${section.toUpperCase()}`,
            type: 'link',
            isPrimary: true,
          },
          {
            path: `/section-${section}/guide/child-${section}`,
            title: `Alias ${section.toUpperCase()}`,
            type: 'link',
            isPrimary: false,
          },
        ],
      }],
    }))

    async function writeNestedMenuFixture(): Promise<void> {
      delete process.env.MDSITE_CONFIG_PATH
      for (const section of ['a', 'b']) {
        const sectionDir = path.join(contentDir, `section-${section}`)
        const guideDir = path.join(sectionDir, 'guide')
        await fs.mkdir(guideDir, { recursive: true })
        await fs.writeFile(path.join(sectionDir, 'index.md'), `# Section ${section.toUpperCase()}\n\nOverview.`, 'utf8')
        await fs.writeFile(path.join(guideDir, 'index.md'), `# Guide ${section.toUpperCase()}\n\nGuide overview.`, 'utf8')
        await fs.writeFile(path.join(guideDir, `child-${section}.md`), `# Child ${section.toUpperCase()}\n\nChild content.`, 'utf8')
      }
      await fs.writeFile(path.join(contentDir, '_menu.yml'), [
        '- section-a:',
        '    - guide:',
        '        - index',
        '        - child-a',
        '        - child-a',
        '        - Alias A: child-a',
        '- section-b:',
        '    - guide:',
        '        - index',
        '        - child-b',
        '        - child-b',
        '        - Alias B: child-b',
        '',
      ].join('\n'), 'utf8')
    }

    async function readNavigation(): Promise<MinimalTreeNode[]> {
      return JSON.parse(await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8'))
    }

    it('assigns globally unique IDs across nested groups, repeated routes, and aliases', async () => {
      await writeNestedMenuFixture()

      await generateNavigationJson()

      const navigation = await readNavigation()
      expect(projectNavigation(navigation)).toEqual(expectedNavigation)
      const nodes = flattenNavigation(navigation)
      expect(nodes).toHaveLength(12)
      for (const section of ['a', 'b']) {
        expect(nodes.filter(node => node.path === `/section-${section}/guide`)).toHaveLength(2)
        expect(nodes.filter(node => node.path === `/section-${section}/guide/child-${section}`)).toHaveLength(3)
      }
      expect(nodes.some(node => node.path.endsWith('/index'))).toBe(false)

      const ids = nodes.map(node => node.id)
      expect(ids.every(id => typeof id === 'string' && id.length > 0)).toBe(true)
      const duplicateIds = new Set(ids.filter((id, index) => ids.indexOf(id) !== index))
      const duplicates = nodes
        .filter(node => duplicateIds.has(node.id))
        .map(node => ({ id: node.id, path: node.path, title: node.title }))
      expect(new Set(ids).size, `Duplicate navigation IDs: ${JSON.stringify(duplicates)}`).toBe(nodes.length)
    })

    it('keeps the full DFS ID sequence deterministic across repeated generation', async () => {
      await writeNestedMenuFixture()

      await generateNavigationJson()
      const firstNavigation = await readNavigation()
      expect(projectNavigation(firstNavigation)).toEqual(expectedNavigation)
      const firstIds = flattenNavigation(firstNavigation).map(node => node.id)
      expect(firstIds).toHaveLength(12)
      expect(firstIds.every(id => typeof id === 'string' && id.length > 0)).toBe(true)

      await generateNavigationJson()
      const secondNavigation = await readNavigation()
      expect(projectNavigation(secondNavigation)).toEqual(expectedNavigation)
      const secondIds = flattenNavigation(secondNavigation).map(node => node.id)
      expect(secondIds).toEqual(firstIds)
    })

    it('keeps every mixed-branch navigation ID unique, nonempty, and deterministic through deep submenus', async (): Promise<void> => {
      const pages: [string, string][] = [
        ['index.md', 'Home'],
        ['guide.md', 'Guide'],
        ['guide/index.md', 'Guide Landing'],
        ['guide/topic.md', 'Topic'],
        ['guide/topic/deep.md', 'Deep'],
        ['guide/topic/deep/index.md', 'Deep Landing'],
        ['guide/topic/deep/page.md', 'Deep Page'],
        ['other.md', 'Other'],
        ['other/page.md', 'Other Page'],
      ]
      for (const [relativePath, title] of pages) {
        const filePath = path.join(contentDir, relativePath)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, `# ${title}\n\nContent.`, 'utf8')
      }
      const mdsitePath = path.join(tempDir, 'mdsite.yml')
      await fs.writeFile(mdsitePath, [
        'menu:',
        '  - index',
        '  - "==="',
        '  - null',
        '  - "Group /::": null',
        '  - "Group /::": ""',
        '  - "Group /::": "==="',
        '  - "Docs /::": https://example.com',
        '  - "Docs /::": http://example.com',
        '  - "Home /::": index',
        '  - guide:',
        '      - index',
        '      - "Home /::": index',
        '      - topic:',
        '          - "==="',
        '          - null',
        '          - "Group /::": null',
        '          - "Docs /::": https://example.com',
        '          - deep:',
        '              - index',
        '              - page',
        '              - page',
        '              - "Page /::": page',
        '              - "Page /::": /other/page',
        '              - "Home /::": index',
        '              - null',
        '              - "Group /::": ""',
        '              - "Docs /::": https://example.com',
        '  - other:',
        '      - page',
        '      - "Page /::": /guide/topic/deep/page',
        '  - guide/topic/deep/page',
        '  - "Page /::": guide/topic/deep/page',
        '',
      ].join('\n'), 'utf8')
      process.env.MDSITE_CONFIG_PATH = mdsitePath

      const expectedMixedNavigation: NavigationProjection[] = [
        { path: '/', title: 'Home', type: 'link', isPrimary: true },
        { path: '//__separator-1', title: '---', type: 'separator' },
        { path: '//__separator-2', title: '---', type: 'separator' },
        { path: '//__header-3', title: 'Group /::', type: 'header' },
        { path: '//__header-4', title: 'Group /::', type: 'header' },
        { path: '//__header-5', title: 'Group /::', type: 'header' },
        { path: 'https://example.com', title: 'Docs /::', type: 'external' },
        { path: 'http://example.com', title: 'Docs /::', type: 'external' },
        { path: '/', title: 'Home /::', type: 'link', isPrimary: false },
        {
          path: '/guide', title: 'Guide', type: 'link', isPrimary: true,
          children: [
            { path: '/guide', title: 'Guide Landing', type: 'link', isPrimary: true },
            { path: '/guide', title: 'Home /::', type: 'link', isPrimary: false },
            {
              path: '/guide/topic', title: 'Topic', type: 'link', isPrimary: true,
              children: [
                { path: '/guide/topic/__separator-0', title: '---', type: 'separator' },
                { path: '/guide/topic/__separator-1', title: '---', type: 'separator' },
                { path: '/guide/topic/__header-2', title: 'Group /::', type: 'header' },
                { path: 'https://example.com', title: 'Docs /::', type: 'external' },
                {
                  path: '/guide/topic/deep', title: 'Deep', type: 'link', isPrimary: true,
                  children: [
                    { path: '/guide/topic/deep', title: 'Deep Landing', type: 'link', isPrimary: true },
                    { path: '/guide/topic/deep/page', title: 'Deep Page', type: 'link', isPrimary: true },
                    { path: '/guide/topic/deep/page', title: 'Deep Page', type: 'link', isPrimary: true },
                    { path: '/guide/topic/deep/page', title: 'Page /::', type: 'link', isPrimary: false },
                    { path: '/other/page', title: 'Page /::', type: 'link', isPrimary: false },
                    { path: '/guide/topic/deep', title: 'Home /::', type: 'link', isPrimary: false },
                    { path: '/guide/topic/deep/__separator-6', title: '---', type: 'separator' },
                    { path: '/guide/topic/deep/__header-7', title: 'Group /::', type: 'header' },
                    { path: 'https://example.com', title: 'Docs /::', type: 'external' },
                  ],
                },
              ],
            },
          ],
        },
        {
          path: '/other', title: 'Other', type: 'link', isPrimary: true,
          children: [
            { path: '/other/page', title: 'Other Page', type: 'link', isPrimary: true },
            { path: '/guide/topic/deep/page', title: 'Page /::', type: 'link', isPrimary: false },
          ],
        },
        { path: '/guide/topic/deep/page', title: 'Deep Page', type: 'link', isPrimary: true },
        { path: '/guide/topic/deep/page', title: 'Page /::', type: 'link', isPrimary: false },
      ]

      await generateNavigationJson()

      const navigation = await readNavigation()
      expect(projectNavigation(navigation)).toEqual(expectedMixedNavigation)
      const ids = assertNavigationIds(navigation)
      expect(ids).toHaveLength(32)

      await generateNavigationJson()

      const repeatedNavigation = await readNavigation()
      expect(projectNavigation(repeatedNavigation)).toEqual(expectedMixedNavigation)
      expect(assertNavigationIds(repeatedNavigation)).toEqual(ids)
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

    it('prefers mdsite.yml over _menu.yml when both exist (canonical config wins)', async () => {
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nContent.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'about.md'), '# About\n\nAbout.', 'utf8')

      // Legacy _menu.yml lists only index + guide
      await fs.writeFile(path.join(contentDir, '_menu.yml'), '- index\n- guide\n', 'utf8')
      // Canonical mdsite.yml in same content dir lists index + about and must win
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
      expect(paths).toEqual(['/', '/about'])
      // guide.md is not in the canonical menu, so the legacy _menu.yml must not override
      expect(navigation.find((n: { path: string }) => n.path === '/guide')).toBeUndefined()
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

  describe('build/dependency directory exclusion', () => {
    async function readSearchIndex() {
      return JSON.parse(await fs.readFile(path.join(publicDir, '_search-index.json'), 'utf8'))
    }

    async function readNavigation() {
      return JSON.parse(await fs.readFile(path.join(publicDir, '_navigation.json'), 'utf8'))
    }

    /**
     * Build a fake content tree that mimics a project root used as the
     * content directory: real user pages alongside build artifacts, hidden
     * editor dirs, and a top-level `node_modules`/`dist`. Returns the set
     * of "expected to be indexed" markdown paths.
     */
    async function plantMixedTree() {
      // User-authored content at the content root
      await fs.writeFile(path.join(contentDir, 'index.md'), '# Home\n\nWelcome home.', 'utf8')
      await fs.writeFile(path.join(contentDir, 'guide.md'), '# Guide\n\nUseful guide.', 'utf8')
      await fs.mkdir(path.join(contentDir, 'features'), { recursive: true })
      await fs.writeFile(path.join(contentDir, 'features', 'theme.md'), '# Theme\n\nContent.', 'utf8')

      // Renderer working dir with nested node_modules containing a README
      // — mimics the layout the CLI materializes on first run.
      await fs.mkdir(path.join(contentDir, '.mdsite', 'node_modules', 'some-pkg'), { recursive: true })
      await fs.writeFile(
        path.join(contentDir, '.mdsite', 'node_modules', 'some-pkg', 'README.md'),
        '# some-pkg\n\nThis is a dependency README and should be ignored.'
      )

      // A top-level node_modules dir (e.g. when the content root IS the
      // project root) should also be skipped.
      await fs.mkdir(path.join(contentDir, 'node_modules', 'transitive'), { recursive: true })
      await fs.writeFile(
        path.join(contentDir, 'node_modules', 'transitive', 'README.md'),
        '# transitive\n\nShould also be ignored.'
      )

      // A `dist` directory (top-level build output) should also be skipped.
      await fs.mkdir(path.join(contentDir, 'dist', 'legacy'), { recursive: true })
      await fs.writeFile(
        path.join(contentDir, 'dist', 'legacy', 'stale.md'),
        '# Stale\n\nShould be ignored.'
      )

      // Any hidden directory at any depth should be skipped — editor state,
      // tooling caches, etc. `.vscode`, `.idea`, `.history`, `.cache` are
      // all common offenders when the content root is the project root.
      for (const hidden of ['.vscode', '.idea', '.history', '.cache']) {
        await fs.mkdir(path.join(contentDir, hidden, 'notes'), { recursive: true })
        await fs.writeFile(
          path.join(contentDir, hidden, 'notes', 'scratch.md'),
          `# ${hidden}\n\nShould be ignored.`
        )
      }

      // Nuxt/Nitro/CMS output dirs that may sit next to the content.
      for (const hidden of ['.nuxt', '.output', '.nitro', '.data', '.git']) {
        await fs.mkdir(path.join(contentDir, hidden), { recursive: true })
        await fs.writeFile(
          path.join(contentDir, hidden, 'scratch.md'),
          `# ${hidden}\n\nShould be ignored.`
        )
      }
    }

    it('does not index .md files under any hidden directory, node_modules, or dist', async () => {
      await plantMixedTree()

      // console.warn would log a "No H1 found" notice for any file the
      // walker still visited — silence it so the test output stays clean.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      try {
        await generateSearchIndexJson()
      } finally {
        warnSpy.mockRestore()
      }

      const searchIndex = await readSearchIndex()
      const paths = searchIndex.map((entry: { path: string }) => entry.path)
      // User-authored pages are still indexed
      expect(paths).toContain('/')
      expect(paths).toContain('/guide')
      expect(paths).toContain('/features/theme')
      // No entry leaks from a build/dependency or hidden directory
      for (const excluded of [
        '.mdsite',
        'node_modules',
        'dist',
        '.nuxt',
        '.output',
        '.nitro',
        '.data',
        '.git',
        '.vscode',
        '.idea',
        '.history',
        '.cache'
      ]) {
        expect(paths.some((p: string) => p.split('/').includes(excluded))).toBe(false)
      }
      const noH1Warnings = warnSpy.mock.calls
        .map((call) => String(call[0] ?? ''))
        .filter((line) => line.startsWith('⚠️'))
      expect(noH1Warnings).toEqual([])
    })

    it('excludes build/dependency and hidden directories from the fallback navigation tree', async () => {
      await plantMixedTree()

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      try {
        await generateNavigationJson()
      } finally {
        warnSpy.mockRestore()
      }

      const navigation = await readNavigation()
      const paths = navigation.map((n: { path: string }) => n.path)
      expect(paths).toContain('/')
      expect(paths).toContain('/guide')
      expect(paths).toContain('/features/theme')
      // No node should be derived from a build/dependency or hidden directory
      for (const excluded of [
        '.mdsite',
        'node_modules',
        'dist',
        '.nuxt',
        '.output',
        '.nitro',
        '.data',
        '.git',
        '.vscode',
        '.idea',
        '.history',
        '.cache'
      ]) {
        expect(paths.some((p: string) => p.split('/').includes(excluded))).toBe(false)
      }

      const noH1Warnings = warnSpy.mock.calls
        .map((call) => String(call[0] ?? ''))
        .filter((line) => line.startsWith('⚠️'))
      expect(noH1Warnings).toEqual([])
    })
  })
})
