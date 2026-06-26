import { describe, expect, it } from 'vitest'
import { withBasePath } from '../utils/base-url'

describe('withBasePath', () => {
  it('keeps root base URLs unchanged', () => {
    expect(withBasePath('/_navigation.json', '/')).toBe('/_navigation.json')
  })

  it('prefixes internal URLs with configured app base URL', () => {
    expect(withBasePath('/_search-index.json', '/mdsite/')).toBe('/mdsite/_search-index.json')
    expect(withBasePath('/about', '/mdsite')).toBe('/mdsite/about')
  })

  it('does not prefix URLs that already include the base URL', () => {
    expect(withBasePath('/mdsite/about', '/mdsite/')).toBe('/mdsite/about')
  })

  it('leaves external and hash URLs unchanged', () => {
    expect(withBasePath('https://example.com/icon.png', '/mdsite/')).toBe('https://example.com/icon.png')
    expect(withBasePath('#section', '/mdsite/')).toBe('#section')
  })
})
