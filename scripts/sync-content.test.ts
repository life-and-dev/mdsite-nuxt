import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface WatchOptionsSubset {
  ignored: (filePath: string, stats?: { isDirectory?: () => boolean }) => boolean
}

const {
  eventHandlers,
  generateFooterJsonMock,
  generateNavigationJsonMock,
  generateSearchIndexJsonMock,
  watcher,
  watchMock
} = vi.hoisted(() => {
  const handlers = new Map<string, (filePath: string) => void>()
  const watcherMock = {
    on: vi.fn()
  }
  return {
    eventHandlers: handlers,
    generateFooterJsonMock: vi.fn(async (): Promise<void> => {}),
    generateNavigationJsonMock: vi.fn(async (): Promise<void> => {}),
    generateSearchIndexJsonMock: vi.fn(async (): Promise<void> => {}),
    watcher: watcherMock,
    watchMock: vi.fn((_patterns: string[], _options: WatchOptionsSubset) => watcherMock)
  }
})

vi.mock('chokidar', () => ({
  default: { watch: watchMock }
}))

vi.mock('fs-extra', () => ({
  default: {
    pathExists: vi.fn(async (): Promise<boolean> => false)
  }
}))

vi.mock('./generate-indices.js', () => ({
  generateFooterJson: generateFooterJsonMock,
  generateNavigationJson: generateNavigationJsonMock,
  generateSearchIndexJson: generateSearchIndexJsonMock
}))

import { startWatcher } from './sync-content.js'

describe('content watcher exclusions', () => {
  const originalEnv = { ...process.env }
  let tempDir: string

  beforeEach(async () => {
    vi.clearAllMocks()
    eventHandlers.clear()
    watcher.on.mockImplementation((event: string, handler: (filePath: string) => void) => {
      eventHandlers.set(event, handler)
      return watcher
    })
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mdsite-watcher-'))
    const configPath = path.join(tempDir, 'mdsite.yml')
    await fs.writeFile(configPath, 'paths:\n  ignore: []\n', 'utf8')
    process.env = {
      ...originalEnv,
      CONTENT_DIR: tempDir,
      MDSITE_CONFIG_PATH: configPath
    }
  })

  afterEach(async () => {
    process.env = { ...originalEnv }
    await fs.rm(tempDir, { force: true, recursive: true })
  })

  it('ignores draft Markdown separately from configured and directory exclusions', async () => {
    await startWatcher()

    const options = watchMock.mock.calls[0]?.[1] as WatchOptionsSubset
    expect(options.ignored(path.join(tempDir, 'guide.draft.md'))).toBe(true)
    expect(options.ignored(path.join(tempDir, 'guide.md'))).toBe(false)
    expect(options.ignored(path.join(tempDir, '.hidden'), { isDirectory: () => true })).toBe(true)
    expect(options.ignored(path.join(tempDir, 'node_modules'), { isDirectory: () => true })).toBe(true)
    expect(options.ignored(path.join(tempDir, 'dist'), { isDirectory: () => true })).toBe(true)
  })

  it.each(['add', 'change', 'unlink'])('does not regenerate metadata for draft Markdown %s events', async (event) => {
    await startWatcher()

    eventHandlers.get(event)?.(path.join(tempDir, 'guide.draft.md'))

    expect(generateNavigationJsonMock).toHaveBeenCalledTimes(1)
    expect(generateSearchIndexJsonMock).toHaveBeenCalledTimes(1)
    expect(generateFooterJsonMock).toHaveBeenCalledTimes(1)
  })
})
