import ignore from 'ignore'

interface ContentIgnore {
  matcher: ReturnType<typeof ignore>
  patterns: readonly string[]
}

export function createContentIgnore(value: string | readonly string[]): ContentIgnore {
  const values = typeof value === 'string' ? [value] : value
  const patterns = values.map(normalizePattern)
  return {
    matcher: ignore().add(patterns),
    patterns
  }
}

export function matches(contentIgnore: ContentIgnore, relativePath: string): boolean {
  const normalizedPath = relativePath.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\//, '')
  if (!normalizedPath || normalizedPath === '..' || normalizedPath.startsWith('../')) {
    return false
  }
  return contentIgnore.matcher.ignores(normalizedPath)
}

export function toNuxtExcludes(contentIgnore: ContentIgnore): string[] {
  return [...new Set(contentIgnore.patterns.flatMap(toNuxtGlobPatterns))]
}

function normalizePattern(pattern: string): string {
  const normalized = pattern.trim()
  if (
    !normalized
    || normalized.startsWith('!')
    || normalized.includes('\0')
    || normalized.includes('\\')
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('/../')
  ) {
    throw new Error(`Invalid paths.ignore pattern: ${JSON.stringify(pattern)}.`)
  }
  return normalized.replace(/^\.\//, '')
}

function toNuxtGlobPatterns(pattern: string): string[] {
  const rootAnchored = pattern.startsWith('/')
  const anchoredPattern = pattern.replace(/^\//, '')
  const directoryPattern = anchoredPattern.endsWith('/')
    ? anchoredPattern.slice(0, -1)
    : anchoredPattern
  const matchesAtAnyDepth = !rootAnchored && !directoryPattern.includes('/')
  const glob = matchesAtAnyDepth ? `**/${directoryPattern}` : directoryPattern

  if (directoryPattern.endsWith('/**')) {
    return [glob]
  }
  return directoryPattern.endsWith('.md')
    ? [glob]
    : [glob, `${glob}/**`]
}
