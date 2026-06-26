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
})
