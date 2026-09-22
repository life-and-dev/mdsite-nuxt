import { describe, expect, it, vi } from 'vitest'
import { runAfterDocumentFontsReady } from './mermaid-fonts'

describe('Mermaid font readiness', () => {
  it('waits for document fonts before rendering', async () => {
    let resolveFonts: (() => void) | undefined
    const ready = new Promise<void>((resolve) => {
      resolveFonts = resolve
    })
    const render = vi.fn(async (): Promise<void> => {})

    const rendering = runAfterDocumentFontsReady({ fonts: { ready } }, render)
    await Promise.resolve()

    expect(render).not.toHaveBeenCalled()

    resolveFonts?.()
    await rendering

    expect(render).toHaveBeenCalledOnce()
  })

  it('renders when font readiness rejects', async () => {
    const render = vi.fn(async (): Promise<void> => {})

    await runAfterDocumentFontsReady({
      fonts: { ready: Promise.reject(new Error('Font loading failed')) }
    }, render)

    expect(render).toHaveBeenCalledOnce()
  })

  it('renders when the FontFaceSet API is unavailable', async () => {
    const render = vi.fn(async (): Promise<void> => {})

    await runAfterDocumentFontsReady({}, render)

    expect(render).toHaveBeenCalledOnce()
  })
})
