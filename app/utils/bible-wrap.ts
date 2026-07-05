/**
 * Build-time Bible reference wrapping.
 *
 * Wraps detected Bible references in a markdown body with
 * `<span class="bible-ref" data-reference="...">` so the client-side
 * tooltip plugin can attach hover/click handlers.
 *
 * Extracted from nuxt.config.ts so it can be unit-tested.
 */
import { createBibleReferencePatterns } from './bible-book-names'

/**
 * Returns true when `index` sits inside a context where Bible references
 * must NOT be wrapped: fenced/inline code blocks or markdown links.
 */
export function isInExcludedContext(text: string, index: number): boolean {
  const before = text.substring(0, index)

  // Fenced code blocks (```)
  const codeBlockCount = (before.match(/```/g) || []).length
  if (codeBlockCount % 2 === 1) return true

  // Inline code (count backticks on the current line)
  const lastNewline = before.lastIndexOf('\n')
  const currentLine = lastNewline === -1 ? before : before.substring(lastNewline + 1)
  const backtickCount = (currentLine.match(/`/g) || []).length
  if (backtickCount % 2 === 1) return true

  // Markdown links: [text](url) - unmatched opening bracket
  const lastOpenBracket = before.lastIndexOf('[')
  const lastCloseBracket = before.lastIndexOf(']')
  if (lastOpenBracket > lastCloseBracket) return true

  return false
}

/**
 * Wraps every detected Bible reference in `body` with a
 * `<span class="bible-ref" data-reference="...">` element.
 *
 * All patterns are matched against the ORIGINAL body in a single pass,
 * and overlapping candidates are de-duplicated (the first collected match
 * wins; cross-chapter patterns run first, so the longest reference wins).
 * This prevents later patterns from re-matching a reference that an
 * earlier pattern already wrapped — e.g. a same-chapter pattern matching
 * "Genesis 1:20-2" inside an already-wrapped "Genesis 1:20-2:2" — which
 * previously produced corrupted nested spans rendered as raw text.
 */
export function wrapBibleReferences(body: string): string {
  const patterns = createBibleReferencePatterns()
  const matches: Array<{ index: number; length: number; text: string }> = []

  // Collect all candidate matches across every pattern against the
  // original, unwrapped body. Skip excluded contexts and any match that
  // overlaps an already-collected match.
  patterns.forEach(pattern => {
    let match
    while ((match = pattern.exec(body)) !== null) {
      const matchStart = match.index
      const matchText = match[0]
      const matchEnd = matchStart + matchText.length

      if (isInExcludedContext(body, matchStart)) continue

      const overlaps = matches.some(m =>
        (matchStart >= m.index && matchStart < m.index + m.length) ||
        (matchEnd > m.index && matchEnd <= m.index + m.length) ||
        (matchStart <= m.index && matchEnd >= m.index + m.length)
      )
      if (overlaps) continue

      matches.push({ index: matchStart, length: matchText.length, text: matchText })
    }
    pattern.lastIndex = 0
  })

  // Sort by index, then replace once in reverse order so earlier indices
  // stay valid as the string grows.
  matches.sort((a, b) => a.index - b.index)
  matches.reverse().forEach(({ index, length, text }) => {
    const before = body.substring(0, index)
    const after = body.substring(index + length)
    const wrapped = `<span class="bible-ref" data-reference="${text}">${text}</span>`
    body = before + wrapped + after
  })

  return body
}
