import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { fromHast } from 'minimark/hast'
import { describe, expect, it } from 'vitest'
import { resolveContentImages } from './markdown-images'

async function parse(source: string, sourceId = 'content/divine/creator.md', baseURL = '/'): Promise<ReturnType<typeof fromHast>> {
  const parsed = await parseMarkdown(source)
  const body = fromHast(parsed.body)
  resolveContentImages(body, sourceId, baseURL)
  return body
}

function elements(nodes: unknown[], tag: string): Record<string, unknown>[] {
  return nodes.flatMap((node) => {
    if (!Array.isArray(node)) return []
    const [name, props, ...children] = node
    return [...(name === tag ? [props] : []), ...elements(children, tag)]
  })
}

describe('resolveContentImages', () => {
  it('resolves Markdown images against the source directory and deployment base', async () => {
    const body = await parse('![Creator](creator.manuscript.webp "Title")\n\n![Diagram](./images/diagram.svg)', 'content/divine/creator.md', '/site/')
    expect(elements(body.value, 'img')).toEqual([
      expect.objectContaining({ src: '/site/divine/creator.manuscript.webp', alt: 'Creator', title: 'Title' }),
      expect.objectContaining({ src: '/site/divine/images/diagram.svg', alt: 'Diagram' })
    ])
    const root = await parse('![Root](image.png)', 'content/index.md')
    expect(elements(root.value, 'img')[0]?.src).toBe('/image.png')
  })

  it('handles parent paths, encoded names, queries, fragments and base-name collisions', async () => {
    const body = await parse('![One](../my%20image.png?size=2#detail)\n\n![Two](photo.png?#)', 'content/site/my folder/page.md', '/site')
    expect(elements(body.value, 'img').map((image) => image.src)).toEqual([
      '/site/site/my%20image.png?size=2#detail',
      '/site/site/my%20folder/photo.png?#'
    ])
  })

  it('preserves absolute, protocol-relative, external and data image URLs', async () => {
    const urls = ['/image.png', '//example.com/image.png', 'https://example.com/image.png', 'data:image/png;base64,abc', 'blob:example']
    const body = await parse(urls.map((url) => `![Image](${url})`).join('\n\n'), 'content/divine/page.md', '/site/')
    expect(elements(body.value, 'img').map((image) => image.src)).toEqual(urls)
  })

  it('resolves reference images without changing links sharing their definition', async () => {
    const body = await parse('![Image][shared] and ![shared][] and [Link][shared]\n\n[shared]: ../image.png "Shared"')
    expect(elements(body.value, 'img')).toEqual([
      expect.objectContaining({ src: '/image.png', title: 'Shared' }),
      expect.objectContaining({ src: '/image.png', title: 'Shared' })
    ])
    expect(elements(body.value, 'a')[0]).toEqual(expect.objectContaining({ href: '../image.png' }))
  })

  it('does not rewrite code, text, links or frontmatter', async () => {
    const source = '---\nimage: image.png\n---\n\n`![Inline](image.png)`\n\n```md\n![Block](image.png)\n```\n\n[Link](image.png) and image.png'
    const parsed = await parseMarkdown(source)
    const body = fromHast(parsed.body)
    const original = structuredClone(body)
    resolveContentImages(body, 'content/divine/page.md', '/site/')
    expect(body).toEqual(original)
    expect(parsed.data.image).toBe('image.png')
  })
})
