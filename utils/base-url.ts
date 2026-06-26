export function withBasePath(pathname: string, baseURL = '/'): string {
  if (isExternalOrHash(pathname)) return pathname

  const normalizedBase = normalizeBaseURL(baseURL)
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`

  if (normalizedBase === '/') return normalizedPath
  if (normalizedPath === normalizedBase.slice(0, -1) || normalizedPath.startsWith(normalizedBase)) return normalizedPath

  return `${normalizedBase.slice(0, -1)}${normalizedPath}`
}

function normalizeBaseURL(baseURL: string): string {
  if (!baseURL || baseURL === '/') return '/'

  const withLeadingSlash = baseURL.startsWith('/') ? baseURL : `/${baseURL}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

function isExternalOrHash(pathname: string): boolean {
  return pathname.startsWith('http://') ||
    pathname.startsWith('https://') ||
    pathname.startsWith('//') ||
    pathname.startsWith('#')
}
