import { describe, it, expect } from 'vitest'
import { wrapBibleReferences } from './bible-wrap'

describe('wrapBibleReferences', () => {
  describe('cross-chapter ranges (regression for raw <span> bug)', () => {
    it('wraps a cross-chapter reference exactly once', () => {
      const result = wrapBibleReferences('Read Genesis 1:20-2:2 today.')
      expect(result).toBe(
        'Read <span class="bible-ref" data-reference="Genesis 1:20-2:2">Genesis 1:20-2:2</span> today.'
      )
    })

    it('produces exactly one opening span (no attribute/content double-wrap)', () => {
      const result = wrapBibleReferences('Read Genesis 1:20-2:2 today.')
      const openSpanCount = (result.match(/<span class="bible-ref"/g) || []).length
      expect(openSpanCount).toBe(1)
    })

    it('wraps a cross-chapter range and includes the translation suffix', () => {
      const result = wrapBibleReferences('See 2 Corinthians 4:16-5:9 (ESV) here.')
      expect(result).toBe(
        'See <span class="bible-ref" data-reference="2 Corinthians 4:16-5:9 (ESV)">2 Corinthians 4:16-5:9 (ESV)</span> here.'
      )
    })

    it('includes the translation suffix for a single verse', () => {
      const result = wrapBibleReferences('Love John 3:16 (KJV) says.')
      expect(result).toBe(
        'Love <span class="bible-ref" data-reference="John 3:16 (KJV)">John 3:16 (KJV)</span> says.'
      )
    })
  })

  describe('existing behavior (must not regress)', () => {
    it('wraps a same-chapter range', () => {
      const result = wrapBibleReferences('Read John 3:16-18 now.')
      expect(result).toBe(
        'Read <span class="bible-ref" data-reference="John 3:16-18">John 3:16-18</span> now.'
      )
    })

    it('wraps a single verse', () => {
      const result = wrapBibleReferences('Love John 3:16 says.')
      expect(result).toBe(
        'Love <span class="bible-ref" data-reference="John 3:16">John 3:16</span> says.'
      )
    })
  })
})
