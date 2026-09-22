import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { glob } from 'tinyglobby'
import { describe, expect, it } from 'vitest'

import { createContentIgnore, matches, toNuxtExcludes } from './content-ignore.js'

describe('content ignore', () => {
  it.each([
    ['AGENTS.md', 'AGENTS.md'],
    ['AGENTS.md', 'nested/AGENTS.md'],
    ['private/', 'nested/private/page.md'],
    ['internal/*.md', 'internal/notes.md'],
    ['drafts/**', 'drafts/deep/page.md'],
    ['./exact/page.md', 'exact/page.md']
  ])('matches gitignore rule %s against %s', (pattern, relativePath) => {
    expect(matches(createContentIgnore(pattern), relativePath)).toBe(true)
  })

  it.each([
    ['internal/*.md', 'nested/internal/notes.md'],
    ['drafts/**', 'nested/drafts/page.md'],
    ['exact/page.md', 'other/exact/page.md']
  ])('keeps slash-containing rule %s relative to content root', (pattern, relativePath) => {
    expect(matches(createContentIgnore(pattern), relativePath)).toBe(false)
  })

  it('translates rules to equivalent Nuxt exclusion globs', () => {
    const contentIgnore = createContentIgnore([
      'AGENTS.md',
      'private/',
      'internal/*.md',
      'drafts/**',
      'exact/page.md'
    ])

    expect(toNuxtExcludes(contentIgnore)).toEqual([
      '**/AGENTS.md',
      '**/private',
      '**/private/**',
      'internal/*.md',
      'drafts/**',
      'exact/page.md'
    ])
  })

  it('produces Nuxt-compatible globs equivalent to configured ignore rules', async () => {
    const fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-ignore-'))
    const files = [
      'AGENTS.md',
      'nested/AGENTS.md',
      'private/page.md',
      'internal/notes.md',
      'internal/deep/notes.md',
      'drafts/deep/page.md',
      'README.md',
      'guide.md'
    ]
    try {
      await Promise.all(files.map(async (file) => {
        const filePath = path.join(fixtureDir, file)
        await fs.mkdir(path.dirname(filePath), { recursive: true })
        await fs.writeFile(filePath, `# ${file}`, 'utf8')
      }))
      const contentIgnore = createContentIgnore(['AGENTS.md', 'private/', 'internal/*.md', 'drafts/**'])

      const included = await glob('**/*.md', {
        cwd: fixtureDir,
        ignore: toNuxtExcludes(contentIgnore)
      })

      expect(included.sort()).toEqual(['README.md', 'guide.md', 'internal/deep/notes.md'])
      for (const file of files) {
        expect(included.includes(file)).toBe(!matches(contentIgnore, file))
      }
    } finally {
      await fs.rm(fixtureDir, { force: true, recursive: true })
    }
  })

  it.each(['!README.md', '', '   ', '../outside.md', 'docs/../outside.md'])(
    'rejects malformed rule %j',
    (pattern) => {
      expect(() => createContentIgnore(pattern)).toThrow('Invalid paths.ignore pattern')
    }
  )
})
