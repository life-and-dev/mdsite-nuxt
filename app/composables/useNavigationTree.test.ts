/**
 * Unit tests for the navigation tree visibility helpers.
 */

import { describe, expect, it } from 'vitest'
import { countClickableMenuItems, shouldShowNavigation } from './useNavigationTree'
import type { TreeNode } from './useNavigationTree'

// Build a clickable link node. Defaults to no children.
function link(id: string, path: string, children: TreeNode[] = []): TreeNode {
  return { id, title: id, path, order: 0, children, parent: undefined, isPrimary: true }
}

function separator(id: string): TreeNode {
  return { id, title: '---', path: '#', order: 0, children: [], isSeparator: true }
}

function header(id: string): TreeNode {
  return { id, title: id, path: '#', order: 0, children: [], isHeader: true }
}

describe('useNavigationTree visibility', () => {
  describe('countClickableMenuItems', () => {
    it('returns 0 for an empty array', () => {
      expect(countClickableMenuItems([])).toBe(0)
    })

    it('counts only non-separator, non-header top-level nodes', () => {
      const nodes = [link('home', '/'), separator('sep-1'), header('hdr-1')]
      expect(countClickableMenuItems(nodes)).toBe(1)
    })

    it('recursively counts children of submenus', () => {
      const nodes = [
        link('home', '/'),
        link('docs', '/docs', [link('a', '/docs/a'), link('b', '/docs/b')])
      ]
      // home (1) + docs parent (1) + a (1) + b (1) = 4
      expect(countClickableMenuItems(nodes)).toBe(4)
    })

    it('does not recurse into separators or headers', () => {
      const nodes = [
        link('home', '/'),
        link('section', '/section', [link('child', '/section/child')])
      ]
      // home (1) + section (1) + child (1) = 3
      expect(countClickableMenuItems(nodes)).toBe(3)
    })
  })

  describe('shouldShowNavigation', () => {
    it('returns false for an empty menu', () => {
      expect(shouldShowNavigation([])).toBe(false)
    })

    it('returns false when there is only 1 clickable item', () => {
      expect(shouldShowNavigation([link('home', '/')])).toBe(false)
    })

    it('returns true when there are 2+ clickable items at the top level', () => {
      expect(shouldShowNavigation([
        link('home', '/'),
        link('about', '/about')
      ])).toBe(true)
    })

    it('returns true when the only top-level item has multiple children', () => {
      // One top-level folder with 2+ nested pages still needs a navigation sidebar
      expect(shouldShowNavigation([
        link('docs', '/docs', [
          link('a', '/docs/a'),
          link('b', '/docs/b')
        ])
      ])).toBe(true)
    })
  })
})
