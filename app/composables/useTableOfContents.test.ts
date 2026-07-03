/**
 * Unit tests for the TOC visibility thresholds.
 */

import { describe, expect, it } from 'vitest'
import { computeShouldShowTOC, TOC_MIN_HEADINGS, TOC_MIN_LINES } from './useTableOfContents'

describe('useTableOfContents threshold', () => {
  it('exposes the expected minimum constants', () => {
    expect(TOC_MIN_HEADINGS).toBe(3)
    expect(TOC_MIN_LINES).toBe(40)
  })

  describe('computeShouldShowTOC', () => {
    it('returns false when headings < 3', () => {
      expect(computeShouldShowTOC(0, 100)).toBe(false)
      expect(computeShouldShowTOC(1, 100)).toBe(false)
      expect(computeShouldShowTOC(2, 100)).toBe(false)
    })

    it('returns false when lines < 40 (and headings >= 3)', () => {
      expect(computeShouldShowTOC(3, 0)).toBe(false)
      expect(computeShouldShowTOC(5, 39)).toBe(false)
    })

    it('returns true when headings >= 3 and lines >= 40', () => {
      expect(computeShouldShowTOC(3, 40)).toBe(true)
      expect(computeShouldShowTOC(5, 100)).toBe(true)
    })

    it('returns true when headings >= 3 and lineCount is null (not yet measured)', () => {
      expect(computeShouldShowTOC(3, null)).toBe(true)
    })
  })
})
