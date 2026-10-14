import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { compileScript, parse } from '@vue/compiler-sfc'
import { transformWithEsbuild } from 'vite'
import * as Vue from 'vue'
import type { App, Component } from 'vue'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../composables/useNavigationTree'

async function compileComponent(name: string): Promise<Component> {
  const filename = fileURLToPath(new URL(`./${name}.vue`, import.meta.url))
  const { descriptor, errors } = parse(readFileSync(filename, 'utf8'), { filename })
  expect(errors).toEqual([])
  const script = compileScript(descriptor, { id: name, inlineTemplate: true })
  const { code } = await transformWithEsbuild(script.content, `${filename}.ts`, {
    loader: 'ts',
    format: 'cjs'
  })
  const module = { exports: {} as { default: Component } }
  const requireVue = (id: string): typeof Vue => {
    if (id !== 'vue') throw new Error(`Unexpected component dependency: ${id}`)
    return Vue
  }
  // Supply Nuxt's Vue auto-imports without rewriting either component's source.
  const evaluate = new Function(
    'module', 'exports', 'require', 'ref', 'computed', 'watch', 'nextTick', 'onMounted', 'useTooltipConfig', code
  )
  evaluate(
    module, module.exports, requireVue,
    Vue.ref, Vue.computed, Vue.watch, Vue.nextTick, Vue.onMounted,
    () => ({ location: Vue.ref('bottom'), maxWidth: 300 })
  )
  return module.exports.default
}

interface HostNode {
  tag: string
  text: string
  attrs: Record<string, unknown>
  children: HostNode[]
  parent: HostNode | null
}

function hostNode(tag: string, text = ''): HostNode {
  return { tag, text, attrs: {}, children: [], parent: null }
}

function remove(node: HostNode): void {
  if (!node.parent) return
  node.parent.children.splice(node.parent.children.indexOf(node), 1)
  node.parent = null
}

const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: (tag) => hostNode(tag),
  createText: (text) => hostNode('#text', text),
  createComment: (text) => hostNode('#comment', text),
  setText: (node, text) => { node.text = text },
  setElementText: (node, text) => {
    for (const child of node.children) child.parent = null
    node.children = []
    node.text = text
  },
  patchProp: (node, key, _previous, value) => { node.attrs[key] = value },
  insert: (node, parent, anchor = null) => {
    remove(node)
    const index = anchor ? parent.children.indexOf(anchor) : parent.children.length
    parent.children.splice(index, 0, node)
    node.parent = parent
  },
  remove,
  parentNode: (node) => node.parent,
  nextSibling: (node) => {
    if (!node.parent) return null
    return node.parent.children[node.parent.children.indexOf(node) + 1] ?? null
  }
})

function primitive(tag: string): Component {
  return Vue.defineComponent({
    inheritAttrs: false,
    setup(_props, { attrs, slots }) {
      return () => Vue.h(tag, attrs, slots.default?.())
    }
  })
}

const tooltip = Vue.defineComponent({
  inheritAttrs: false,
  setup(_props, { slots }) {
    return () => slots.activator?.({ props: {} }) ?? []
  }
})

function fixtureNode(id: string, title: string, path: string, children: TreeNode[] = []): TreeNode {
  return { id, title, path, order: 0, children, isPrimary: true }
}

function fixture(includeExpandableAlias = false): TreeNode {
  const childB = fixtureNode('menu/1/0/0', 'Child B', '/section-b/guide/child-b')
  childB.description = 'Primary child tooltip'
  const root: TreeNode = {
    id: 'root', title: 'Home', path: '/', order: -1,
    children: [
      fixtureNode('menu/0', 'Section A', '/section-a', [
        fixtureNode('menu/0/0', 'Guide', '/section-a/guide', [
          fixtureNode('menu/0/0/0', 'Child A', '/section-a/guide/child-a')
        ])
      ]),
      fixtureNode('menu/1', 'Section B', '/section-b', [
        fixtureNode('menu/1/0', 'Guide', '/section-b/guide', [childB]),
        fixtureNode('menu/1/1', 'Reference B', '/section-b/reference', [
          fixtureNode('menu/1/1/0', 'Reference child', '/section-b/reference/child')
        ])
      ])
    ]
  }
  if (includeExpandableAlias) {
    const expandableAlias = fixtureNode('menu/2/1', 'Guide', '/shared-section/guide', [
      fixtureNode('menu/2/1/0', 'Alias child', '/shared-section/guide/alias-child')
    ])
    expandableAlias.isPrimary = false
    root.children.push(fixtureNode('menu/2', 'Shared section', '/shared-section', [
      fixtureNode('menu/2/0', 'Guide', expandableAlias.path, [
        fixtureNode('menu/2/0/0', 'Primary child', '/shared-section/guide/primary-child')
      ]),
      expandableAlias
    ]))
  }
  const ids = new Set<string>()
  const attachParents = (node: TreeNode): void => {
    expect(ids.has(node.id), `Duplicate fixture ID: ${node.id}`).toBe(false)
    ids.add(node.id)
    node.children.forEach((child, order) => {
      child.parent = node
      child.order = order
      attachParents(child)
    })
  }
  attachParents(root)
  return root
}

function countPathMatches(node: TreeNode, path: string): number {
  return Number(node.path === path) + node.children.reduce(
    (count, child) => count + countPathMatches(child, path), 0
  )
}

function hasClass(node: HostNode, name: string): boolean {
  return typeof node.attrs.class === 'string' && node.attrs.class.split(/\s+/).includes(name)
}

function elements(node: HostNode): HostNode[] {
  return [node, ...node.children.flatMap(elements)]
}

function text(node: HostNode): string {
  if (node.tag === '#comment') return ''
  return node.text + node.children.map(text).join('')
}

function titles(container: HostNode): string[] {
  return elements(container).filter((node) => hasClass(node, 'node-title')).map((node) => text(node).trim())
}

function findRow(container: HostNode, node: TreeNode): HostNode | undefined {
  const ancestors: TreeNode[] = []
  let current = node
  while (current.parent) {
    ancestors.unshift(current)
    current = current.parent
  }
  let children = container.children.find((child) => hasClass(child, 'navigation-tree'))
  for (const ancestor of ancestors) {
    if (!ancestor.parent) return undefined
    // Match fixture IDs to sibling positions; rendered wrappers expose neither IDs nor paths.
    const index = ancestor.parent.children.findIndex((child) => child.id === ancestor.id)
    const wrapper = children?.children.filter((child) => hasClass(child, 'tree-node-wrapper'))[index]
    const renderedRow = wrapper?.children.find((child) => hasClass(child, 'tree-node'))
    if (!renderedRow) return undefined
    if (ancestor.id === node.id) return renderedRow
    children = wrapper?.children.find((child) => hasClass(child, 'tree-children'))
  }
  return undefined
}

function row(container: HostNode, node: TreeNode): HostNode {
  const found = findRow(container, node)
  if (!found) throw new Error(`Rendered node not found: ${node.id} (${node.path})`)
  return found
}

async function flush(): Promise<void> {
  // Scroll callbacks enqueue another nextTick after route watchers and mounting.
  await Vue.nextTick()
  await Vue.nextTick()
}

async function click(container: HostNode, node: TreeNode, target: 'chevron' | 'title' = 'chevron'): Promise<void> {
  const className = target === 'chevron' ? 'chevron-button' : 'node-title'
  const control = row(container, node).children.find((child) => hasClass(child, className))
  if (typeof control?.attrs.onClick !== 'function') throw new Error(`Click target not found: ${node.id} ${target}`)
  control.attrs.onClick()
  await flush()
}

let NavigationTree: Component
let TreeNodeComponent: Component
let app: App<HostNode> | undefined

async function mount(active = '/', tree = fixture()): Promise<{
  container: HostNode
  tree: TreeNode
  activePath: Vue.ShallowRef<string>
  selections: string[]
}> {
  const container = hostNode('root')
  const activePath = Vue.shallowRef(active)
  const selections: string[] = []
  app = renderer.createApp({
    setup() {
      return () => Vue.h(NavigationTree, {
        tree,
        activePath: activePath.value,
        onSelect: (path: string) => selections.push(path)
      })
    }
  })
  app.component('TreeNode', TreeNodeComponent)
  app.component('v-btn', primitive('button'))
  app.component('v-icon', primitive('i'))
  app.component('v-divider', primitive('hr'))
  app.component('v-tooltip', tooltip)
  app.mount(container)
  await flush()
  return { container, tree, activePath, selections }
}

beforeAll(async () => {
  ;[NavigationTree, TreeNodeComponent] = await Promise.all([
    compileComponent('NavigationTree'), compileComponent('TreeNode')
  ])
})

beforeEach(() => {
  vi.stubGlobal('document', { querySelector: vi.fn(() => null) })
})

afterEach(async () => {
  try {
    await flush()
  } finally {
    app?.unmount()
    app = undefined
    vi.unstubAllGlobals()
  }
})

describe('NavigationTree rendered expansion with structural IDs', () => {
  it('toggles nested guides independently across sections', async () => {
    const { container, tree, selections } = await mount()
    const [sectionA, sectionB] = tree.children
    const guideA = sectionA.children[0]
    const guideB = sectionB.children[0]
    expect([guideA.title, guideB.title]).toEqual(['Guide', 'Guide'])
    expect([guideA.path, guideB.path]).toEqual(['/section-a/guide', '/section-b/guide'])
    expect([guideA.path.split('/').at(-1), guideB.path.split('/').at(-1)]).toEqual(['guide', 'guide'])
    expect([guideA.id, guideB.id]).toEqual(['menu/0/0', 'menu/1/0'])
    expect(titles(container)).toEqual(['Section A', 'Section B'])
    await click(container, sectionA)
    expect(text(row(container, guideA)).trim()).toBe('Guide')
    await click(container, guideA)
    expect(titles(container)).toContain('Child A')
    await click(container, guideA)
    expect(titles(container)).not.toContain('Child A')

    await click(container, sectionB)
    expect(findRow(container, guideA)).toBeUndefined()
    expect(text(row(container, guideB)).trim()).toBe('Guide')
    expect(hasClass(row(container, guideB), 'is-expanded')).toBe(false)
    await click(container, guideB)
    expect(titles(container)).toContain('Child B')
    expect(titles(container)).not.toContain('Child A')

    await click(container, sectionA)
    expect(hasClass(row(container, guideA), 'is-expanded')).toBe(false)
    expect(titles(container)).not.toContain('Child A')
    await click(container, sectionB)
    expect(titles(container)).toContain('Child B')
    await click(container, guideB)
    expect(titles(container)).not.toContain('Child B')
    expect(selections).toEqual([])
  })

  it('collapses same-level sibling branches through their own chevrons', async () => {
    const { container, tree } = await mount()
    const sectionB = tree.children[1]
    const [guideB, referenceB] = sectionB.children
    await click(container, sectionB)
    await click(container, guideB)
    expect(titles(container)).toContain('Child B')
    await click(container, referenceB)
    expect(titles(container)).toContain('Reference child')
    expect(titles(container)).not.toContain('Child B')
    expect(hasClass(row(container, guideB), 'is-expanded')).toBe(false)
    await click(container, guideB)
    expect(titles(container)).toContain('Child B')
    expect(titles(container)).not.toContain('Reference child')
    expect(hasClass(row(container, referenceB), 'is-expanded')).toBe(false)
  })

  it('retains descendant expansion state when a parent collapses and reopens', async () => {
    const { container, tree } = await mount()
    const sectionB = tree.children[1]
    const guideB = sectionB.children[0]
    await click(container, sectionB)
    await click(container, guideB)
    await click(container, sectionB)
    expect(titles(container)).toEqual(['Section A', 'Section B'])
    await click(container, sectionB)
    expect(hasClass(row(container, guideB), 'is-expanded')).toBe(true)
    expect(titles(container)).toContain('Child B')

    await click(container, guideB)
    await click(container, sectionB)
    await click(container, sectionB)
    expect(hasClass(row(container, guideB), 'is-expanded')).toBe(false)
    expect(titles(container)).not.toContain('Child B')
  })

  it('opens direct-route ancestors, highlights active links and preserves route watcher behavior', async () => {
    const { container, tree, activePath, selections } = await mount('/section-b/guide/child-b')
    const [sectionA, sectionB] = tree.children
    const guideA = sectionA.children[0]
    const childA = guideA.children[0]
    const [guideB, referenceB] = sectionB.children
    const childB = guideB.children[0]
    expect(countPathMatches(tree, '/section-a/guide/child-a')).toBe(1)
    expect(countPathMatches(tree, '/section-b/guide/child-b')).toBe(1)
    expect(titles(container)).toEqual([
      'Section A', 'Section B', 'Guide', 'Child B', 'Reference B'
    ])
    expect(hasClass(row(container, sectionA), 'is-expanded')).toBe(false)
    expect(hasClass(row(container, sectionB), 'is-expanded')).toBe(true)
    expect(hasClass(row(container, guideB), 'is-expanded')).toBe(true)
    expect(hasClass(row(container, referenceB), 'is-expanded')).toBe(false)
    expect(hasClass(row(container, childB), 'is-active')).toBe(true)
    await click(container, childB, 'title')
    expect(selections).toEqual(['/section-b/guide/child-b'])

    await click(container, guideB, 'title')
    expect(titles(container)).not.toContain('Child B')
    expect(selections).toEqual([
      '/section-b/guide/child-b', '/section-b/guide'
    ])
    activePath.value = '/section-b/guide'
    await flush()
    expect(hasClass(row(container, guideB), 'is-active')).toBe(true)
    expect(hasClass(row(container, guideB), 'is-expanded')).toBe(false)

    activePath.value = '/section-b/guide/child-b'
    await flush()
    expect(hasClass(row(container, childB), 'is-active')).toBe(true)
    activePath.value = '/section-a/guide/child-a'
    await flush()
    expect(hasClass(row(container, childA), 'is-active')).toBe(true)
    expect(hasClass(row(container, childB), 'is-active')).toBe(false)
    expect(titles(container)).toContain('Child B')

    await click(container, guideB)
    await click(container, sectionB)
    expect(hasClass(row(container, sectionB), 'is-expanded')).toBe(false)
    expect(findRow(container, guideB)).toBeUndefined()
    expect(titles(container)).not.toContain('Child B')
    expect(hasClass(row(container, childA), 'is-active')).toBe(true)
    activePath.value = '/section-b/guide/child-b'
    await flush()
    expect(hasClass(row(container, sectionB), 'is-expanded')).toBe(true)
    expect(hasClass(row(container, guideB), 'is-expanded')).toBe(true)
    expect(titles(container)).toContain('Child B')
    expect(hasClass(row(container, childB), 'is-active')).toBe(true)
    expect(hasClass(row(container, childA), 'is-active')).toBe(false)

    activePath.value = '/'
    await flush()
    expect(titles(container)).toEqual(['Section A', 'Section B'])
    expect(elements(container).some((node) => hasClass(node, 'is-active'))).toBe(false)
    expect(selections).toHaveLength(2)
  })

  it('isolates same-route expandable primary and alias nodes by structural ID', async () => {
    const { container, tree, selections } = await mount('/shared-section/guide', fixture(true))
    const [primary, alias] = tree.children[2].children
    expect([primary.id, alias.id]).toEqual(['menu/2/0', 'menu/2/1'])
    expect([primary.path, alias.path]).toEqual(['/shared-section/guide', '/shared-section/guide'])
    expect([primary.isPrimary, alias.isPrimary]).toEqual([true, false])
    expect(primary.children[0].path).not.toBe(alias.children[0].path)
    expect(hasClass(row(container, primary), 'is-active')).toBe(true)
    expect(hasClass(row(container, alias), 'is-active')).toBe(false)
    expect(hasClass(row(container, primary), 'is-expanded')).toBe(false)
    expect(hasClass(row(container, alias), 'is-expanded')).toBe(false)

    await click(container, primary)
    expect(titles(container)).toContain('Primary child')
    expect(titles(container)).not.toContain('Alias child')
    expect(hasClass(row(container, alias), 'is-expanded')).toBe(false)
    await click(container, alias)
    expect(titles(container)).toContain('Alias child')
    expect(titles(container)).not.toContain('Primary child')
    expect(hasClass(row(container, primary), 'is-expanded')).toBe(false)
    expect(hasClass(row(container, alias), 'is-expanded')).toBe(true)
    expect(hasClass(row(container, primary), 'is-active')).toBe(true)
    expect(hasClass(row(container, alias), 'is-active')).toBe(false)

    await click(container, primary)
    expect(titles(container)).toContain('Primary child')
    expect(titles(container)).not.toContain('Alias child')
    expect(hasClass(row(container, alias), 'is-expanded')).toBe(false)
    expect(selections).toEqual([])
    await click(container, alias, 'title')
    expect(titles(container)).toContain('Alias child')
    expect(titles(container)).not.toContain('Primary child')
    expect(hasClass(row(container, primary), 'is-active')).toBe(true)
    expect(hasClass(row(container, alias), 'is-active')).toBe(false)
    expect(selections).toEqual(['/shared-section/guide'])
  })
})
