function resolveImageUrl(src: string, sourceId: string, baseURL: string): string {
  if (!src || src.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(src)) return src

  // A relative image in `divine/creator.md` belongs under `/divine/`, not the page URL `/divine/creator/`.
  const sourcePath = sourceId.split('/').slice(1).map(encodeURIComponent).join('/')
  if (!sourcePath) return src

  const origin = 'https://mdsite.invalid'
  const resolved = new URL(src, `${origin}/${sourcePath}`)
  if (resolved.origin !== origin) return src

  // Keep the source-relative image under the deployment base path.
  const base = `/${baseURL.split('/').filter(Boolean).join('/')}`.replace(/\/$/, '')
  return `${base}${resolved.href.slice(origin.length)}`
}

export function resolveContentImages(body: unknown, sourceId: string, baseURL: string): void {
  if (!body || typeof body !== 'object' || !('type' in body) || body.type !== 'minimark' || !('value' in body) || !Array.isArray(body.value)) return

  function visit(node: unknown): void {
    if (!Array.isArray(node)) return
    const [tag, props, ...children] = node
    if (tag === 'pre' || tag === 'code') return
    if (tag === 'img' && props && typeof props === 'object' && typeof props.src === 'string') {
      props.src = resolveImageUrl(props.src, sourceId, baseURL)
    }
    children.forEach(visit)
  }

  body.value.forEach(visit)
}
