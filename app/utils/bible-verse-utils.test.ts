import { describe, it, expect } from 'vitest'
import {
  createBibleHubInterlinearUrl,
  parseReference,
  parseVerseRange,
  processBollsCrossChapterRange,
  type BollsVerseResponse
} from './bible-verse-utils'

/**
 * Unit tests for BibleHub interlinear URL generation
 */
describe('BibleHub Interlinear URL Generation', () => {
  it('should create URL for single verse reference', () => {
    const url = createBibleHubInterlinearUrl('John 3:16')
    expect(url).toBe('https://biblehub.com/interlinear/john/3-16.htm')
  })

  it('should create URL for chapter-only reference', () => {
    const url = createBibleHubInterlinearUrl('Psalm 23')
    expect(url).toBe('https://biblehub.com/interlinear/psalm/23.htm')
  })

  it('should create URL for verse range (use first verse)', () => {
    const url = createBibleHubInterlinearUrl('John 3:16-18')
    expect(url).toBe('https://biblehub.com/interlinear/john/3-16.htm')
  })

  it('should handle book names with spaces', () => {
    const url = createBibleHubInterlinearUrl('1 Corinthians 13:4')
    expect(url).toBe('https://biblehub.com/interlinear/1_corinthians/13-4.htm')
  })

  it('should handle book names with numbers', () => {
    const url = createBibleHubInterlinearUrl('2 Timothy 3:16')
    expect(url).toBe('https://biblehub.com/interlinear/2_timothy/3-16.htm')
  })

  it('should handle multi-word book names', () => {
    const url = createBibleHubInterlinearUrl('Song of Solomon 2:1')
    expect(url).toBe('https://biblehub.com/interlinear/song_of_solomon/2-1.htm')
  })

  it('should handle cross-chapter ranges (use first reference)', () => {
    const url = createBibleHubInterlinearUrl('2 Corinthians 4:16-5:9')
    expect(url).toBe('https://biblehub.com/interlinear/2_corinthians/4-16.htm')
  })

  it('should handle Genesis references', () => {
    const url = createBibleHubInterlinearUrl('Genesis 1:1')
    expect(url).toBe('https://biblehub.com/interlinear/genesis/1-1.htm')
  })

  it('should handle Revelation references', () => {
    const url = createBibleHubInterlinearUrl('Revelation 1:5')
    expect(url).toBe('https://biblehub.com/interlinear/revelation/1-5.htm')
  })

  it('should handle Ecclesiastes references', () => {
    const url = createBibleHubInterlinearUrl('Ecclesiastes 1:2')
    expect(url).toBe('https://biblehub.com/interlinear/ecclesiastes/1-2.htm')
  })

  it('should handle references with multiple spaces', () => {
    const url = createBibleHubInterlinearUrl('1  Corinthians  13:4')
    expect(url).toBe('https://biblehub.com/interlinear/1_corinthians/13-4.htm')
  })

  it('should fallback to main page for invalid reference', () => {
    const url = createBibleHubInterlinearUrl('InvalidBook')
    expect(url).toBe('https://biblehub.com/interlinear/')
  })

  it('should fallback to main page for empty reference', () => {
    const url = createBibleHubInterlinearUrl('')
    expect(url).toBe('https://biblehub.com/interlinear/')
  })

  it('should normalize book names to lowercase', () => {
    const url = createBibleHubInterlinearUrl('JOHN 3:16')
    expect(url).toBe('https://biblehub.com/interlinear/john/3-16.htm')
  })

  it('should handle chapter with large verse number', () => {
    const url = createBibleHubInterlinearUrl('Psalm 119:105')
    expect(url).toBe('https://biblehub.com/interlinear/psalm/119-105.htm')
  })
})

/**
 * Unit tests for Bible reference parsing with translation extraction
 */
describe('parseReference', () => {
  it('should parse reference with ESV translation', () => {
    const result = parseReference('John 3:16 (ESV)')
    expect(result.reference).toBe('John 3:16')
    expect(result.translation).toBe('ESV')
  })

  it('should parse reference with KJV translation', () => {
    const result = parseReference('Genesis 1:1 (KJV)')
    expect(result.reference).toBe('Genesis 1:1')
    expect(result.translation).toBe('KJV')
  })

  it('should parse reference with NIV translation', () => {
    const result = parseReference('Matthew 5:3-12 (NIV)')
    expect(result.reference).toBe('Matthew 5:3-12')
    expect(result.translation).toBe('NIV')
  })

  it('should default to ESV when no translation specified', () => {
    const result = parseReference('John 3:16')
    expect(result.reference).toBe('John 3:16')
    expect(result.translation).toBe('ESV')
  })

  it('should default to ESV for chapter-only reference', () => {
    const result = parseReference('Psalm 23')
    expect(result.reference).toBe('Psalm 23')
    expect(result.translation).toBe('ESV')
  })

  it('should handle extra whitespace around translation', () => {
    const result = parseReference('John 3:16  (ESV)  ')
    expect(result.reference).toBe('John 3:16')
    expect(result.translation).toBe('ESV')
  })

  it('should handle references with extra whitespace', () => {
    const result = parseReference('  John 3:16  ')
    expect(result.reference).toBe('John 3:16')
    expect(result.translation).toBe('ESV')
  })

  it('should parse cross-chapter range with translation', () => {
    const result = parseReference('2 Corinthians 4:16-5:9 (ESV)')
    expect(result.reference).toBe('2 Corinthians 4:16-5:9')
    expect(result.translation).toBe('ESV')
  })

  it('should handle translation codes with varying lengths', () => {
    const result = parseReference('John 3:16 (NKJV)')
    expect(result.reference).toBe('John 3:16')
    expect(result.translation).toBe('NKJV')
  })

  it('should not parse lowercase translations', () => {
    // Lowercase should not match - treated as no translation
    const result = parseReference('John 3:16 (esv)')
    expect(result.reference).toBe('John 3:16 (esv)')
    expect(result.translation).toBe('ESV')
  })
})

const makeVerse = (verse: number, text: string): BollsVerseResponse => ({ pk: verse, verse, text })

describe('parseVerseRange', () => {
  it('parses a cross-chapter range', () => {
    expect(parseVerseRange('Genesis 1:20-2:2')).toEqual({
      book: 'Genesis', startChapter: 1, startVerse: 20,
      endChapter: 2, endVerse: 2, isCrossChapter: true,
    })
  })

  it('parses a cross-chapter range with a multi-word book', () => {
    expect(parseVerseRange('2 Corinthians 4:16-5:9')).toEqual({
      book: '2 Corinthians', startChapter: 4, startVerse: 16,
      endChapter: 5, endVerse: 9, isCrossChapter: true,
    })
  })

  it('parses a same-chapter range', () => {
    expect(parseVerseRange('John 3:16-18')).toEqual({
      book: 'John', startChapter: 3, startVerse: 16,
      endChapter: 3, endVerse: 18, isCrossChapter: false,
    })
  })

  it('parses a single verse', () => {
    expect(parseVerseRange('John 3:16')).toEqual({
      book: 'John', startChapter: 3, startVerse: 16,
      endChapter: 3, endVerse: 16, isCrossChapter: false,
    })
  })

  it('returns null for a chapter-only reference', () => {
    expect(parseVerseRange('Psalm 23')).toBeNull()
  })
})

describe('processBollsCrossChapterRange', () => {
  it('merges the tail of the start chapter and the head of the end chapter', () => {
    const chapter1 = [
      makeVerse(18, 'c1v18'), makeVerse(19, 'c1v19'),
      makeVerse(20, 'c1v20'), makeVerse(21, 'c1v21'), makeVerse(22, 'c1v22'),
    ]
    const chapter2 = [
      makeVerse(1, 'c2v1'), makeVerse(2, 'c2v2'), makeVerse(3, 'c2v3'),
    ]
    // Genesis 1:20-2:2 => startVerse=20, endVerse=2
    const result = processBollsCrossChapterRange([chapter1, chapter2], 'ESV', 20, 2)
    // c1 >= 20 -> v20,v21,v22 ; c2 <= 2 -> v1,v2 ; 5 verses -> truncated to 4
    expect(result.text).toBe('c1v20 c1v21 c1v22 c2v1 ...')
    expect(result.translation).toBe('ESV')
  })

  it('includes full middle chapters when the range spans 3 chapters', () => {
    const c1 = [makeVerse(9, 'a9'), makeVerse(10, 'a10')]
    const c2 = [makeVerse(1, 'b1')]
    const c3 = [makeVerse(1, 'c1'), makeVerse(2, 'c2')]
    const result = processBollsCrossChapterRange([c1, c2, c3], 'KJV', 10, 2)
    // c1 >= 10 -> a10 ; c2 all -> b1 ; c3 <= 2 -> c1,c2 ; 4 verses -> no truncation
    expect(result.text).toBe('a10 b1 c1 c2')
    expect(result.translation).toBe('KJV')
  })

  it('returns empty text when no chapter data is provided', () => {
    const result = processBollsCrossChapterRange([], 'ESV', 1, 1)
    expect(result.text).toBe('')
  })
})
