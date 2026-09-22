#!/usr/bin/env node

import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import { createContentIgnore, matches } from '../utils/content-ignore'
import { loadMdsiteConfigSync } from '../utils/mdsite-config'
import type { MdsiteFooterItem, MdsiteMenuItem } from '../utils/mdsite-config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ----------------------------------------------------------------------------
// SHARED TYPES & HELPERS
// ----------------------------------------------------------------------------

/**
 * Get content domain from environment variable
 */
function getContentDomain(): string {
    return process.env.CONTENT || 'cms'
}

/**
 * Get source directory for content domain
 */
function getSourceDir(): string {
    if (process.env.CONTENT_DIR) return process.env.CONTENT_DIR
    return path.resolve(__dirname, '..', '../../md-content', getContentDomain())
}

/**
 * Get target public directory
 */
function getTargetDir(): string {
    if (process.env.MDSITE_PUBLIC_DIR) return process.env.MDSITE_PUBLIC_DIR
    return path.resolve(__dirname, '..', 'public')
}

/**
 * Extract H1 title from markdown content
 */
function extractH1Title(content: string): string | null {
    const h1Match = content.match(/^#\s+(.+)$/m)
    return h1Match?.[1]?.trim() ?? null
}

/**
 * Extract frontmatter metadata from markdown content
 * Unified to support both navigation (description) and search (keywords)
 */
function extractMarkdownMetadata(content: string): {
    title: string | null
    description?: string
    keywords?: string[]
} {
    const title = extractH1Title(content)

    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
    const frontmatter = frontmatterMatch?.[1]

    if (!frontmatter) {
        return { title }
    }

    // Extract description
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m)
    const description = descMatch?.[1]?.trim()

    // Extract keywords (YAML array format)
    const keywordsMatch = frontmatter.match(/^keywords:\s*\[(.*)\]$/m)
    const keywordsStr = keywordsMatch?.[1]
    let keywords: string[] | undefined
    if (keywordsStr) {
        keywords = keywordsStr
            .split(',')
            .map(k => k.trim().replace(/['"]/g, ''))
            .filter(Boolean)
    }

    return { title, description, keywords }
}

/**
 * Get markdown file path from relative path
 */
function getMarkdownPath(relativePath: string): string {
    const sourceDir = getSourceDir()
    // If it already has an extension, don't append .md
    if (relativePath.endsWith('.md')) {
        return path.join(sourceDir, relativePath)
    }
    return path.join(sourceDir, `${relativePath}.md`)
}

function getConfiguredContentIgnore(sourceDir: string): ReturnType<typeof createContentIgnore> {
    const parentConfigPath = path.join(sourceDir, '..', 'mdsite.yml')
    const localConfigPath = path.join(sourceDir, 'mdsite.yml')
    const configPath = process.env.MDSITE_CONFIG_PATH
        ?? (fs.existsSync(parentConfigPath) ? parentConfigPath : localConfigPath)
    const { config } = loadMdsiteConfigSync({ configPath, contentPath: sourceDir })
    return createContentIgnore(config.paths.ignore)
}

function isIgnoredMarkdownPath(
    contentIgnore: ReturnType<typeof createContentIgnore>,
    resolvedPath: string
): boolean {
    const relativePath = resolvedPath.replace(/^\//, '').replace(/\.md$/, '')
    return matches(contentIgnore, `${relativePath}.md`) || matches(contentIgnore, `${relativePath}/`)
}

// ----------------------------------------------------------------------------
// NAVIGATION LOGIC
// ----------------------------------------------------------------------------

/**
 * Minimal navigation tree node for client consumption
 */
export interface MinimalTreeNode {
    id: string
    title: string
    path: string
    type: 'link' | 'separator' | 'header' | 'external'
    children?: MinimalTreeNode[]
    description?: string
    isPrimary?: boolean
}

// `MdsiteMenuItem` is imported from `~/utils/mdsite-config` (see top of file).
// It is the same recursive shape that was previously defined locally as
// `MdsiteMenuItem`. Single source of truth lives in `utils/mdsite-config.ts`
// so the Nuxt runtime-config type generator can infer it correctly.
/**
 * Normalize URL path so a trailing /index resolves to its parent.
 * Mirrors filePathToUrlPath behavior so menu paths match content routes.
 *
 * Examples:
 *   /index          -> /
 *   /features/index -> /features
 *   /               -> /
 *   /architecture   -> /architecture
 */
function normalizeIndexPath(resolvedPath: string): string {
    if (resolvedPath === '/index') return '/'
    if (resolvedPath.endsWith('/index')) {
        return resolvedPath.slice(0, -('/index'.length))
    }
    return resolvedPath
}

/**
 * Resolve relative/absolute paths in menu
 */
function resolvePath(menuPath: string, contextPath: string): string {
    // Absolute path
    if (menuPath.startsWith('/')) {
        return menuPath
    }

    // Parent directory (..)
    if (menuPath.startsWith('../')) {
        const contextSegments = contextPath.split('/').filter(Boolean)
        contextSegments.pop() // Remove last segment
        const relativePart = menuPath.substring(3) // Remove '../'
        return contextSegments.length > 0
            ? `/${contextSegments.join('/')}/${relativePart}`
            : `/${relativePart}`
    }

    // Current directory (./)
    if (menuPath.startsWith('./')) {
        const relativePart = menuPath.substring(2)
        return contextPath === '/' ? `/${relativePart}` : `${contextPath}/${relativePart}`
    }

    // Relative to context (no prefix)
    return contextPath === '/' ? `/${menuPath}` : `${contextPath}/${menuPath}`
}

/**
 * Process menu items recursively and build minimal tree structure
 */
async function processMenuItems(
    items: MdsiteMenuItem[],
    contextPath: string,
    order: number = 0,
    contentIgnore: ReturnType<typeof createContentIgnore> = getConfiguredContentIgnore(getSourceDir())
): Promise<{ nodes: MinimalTreeNode[], nextOrder: number }> {
    const nodes: MinimalTreeNode[] = []

    for (const item of items) {
        // Handle null/blank (separator) - legacy support
        if (item === null) {
            nodes.push({
                id: `separator-${order}`,
                title: '---',
                path: `${contextPath}/__separator-${order}`,
                type: 'separator'
            })
            order++
            continue
        }

        // Handle string items
        if (typeof item === 'string') {
            // Check for separator marker
            if (item === '===') {
                nodes.push({
                    id: `separator-${order}`,
                    title: '---',
                    path: `${contextPath}/__separator-${order}`,
                    type: 'separator'
                })
                order++
                continue
            }

            // String → lookup H1 and description from markdown file
            const resolvedPath = resolvePath(item, contextPath)
            if (isIgnoredMarkdownPath(contentIgnore, resolvedPath)) {
                continue
            }
            const markdownPath = getMarkdownPath(resolvedPath)

            let title: string | null = null
            let description: string | undefined = undefined

            try {
                if (await fs.pathExists(markdownPath)) {
                    const content = await fs.readFile(markdownPath, 'utf-8')
                    const metadata = extractMarkdownMetadata(content)
                    title = metadata.title
                    description = metadata.description
                }
            } catch (e) {
                // Ignore missing files
            }

            nodes.push({
                id: `${resolvedPath.split('/').filter(Boolean).pop() || 'home'}-${order}`,
                title: title || item,
                path: normalizeIndexPath(resolvedPath),
                type: 'link',
                description,
                isPrimary: true
            })
            order++
            continue
        }

        // Handle object (custom title, external link, header, or submenu)
        if (typeof item === 'object') {
            for (const [key, value] of Object.entries(item)) {
                // Handle header marker (value === '===')
                if (value === '===') {
                    nodes.push({
                        id: `header-${order}`,
                        title: key,
                        path: `${contextPath}/__header-${order}`,
                        type: 'header'
                    })
                    order++
                    continue
                }

                // Handle null/empty value (legacy header support)
                if (value === null || value === '') {
                    nodes.push({
                        id: `header-${order}`,
                        title: key,
                        path: `${contextPath}/__header-${order}`,
                        type: 'header'
                    })
                    order++
                    continue
                }

                // Handle external URL
                if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) {
                    nodes.push({
                        id: `external-${order}`,
                        title: key,
                        path: value,
                        type: 'external'
                    })
                    order++
                    continue
                }

                // Handle submenu (array value) - key is markdown filename
                if (Array.isArray(value)) {
                    const submenuPath = resolvePath(key, contextPath)
                    if (isIgnoredMarkdownPath(contentIgnore, submenuPath)) {
                        continue
                    }
                    const markdownPath = getMarkdownPath(submenuPath)

                    let title: string | null = null
                    let description: string | undefined = undefined

                    try {
                        if (await fs.pathExists(markdownPath)) {
                            const content = await fs.readFile(markdownPath, 'utf-8')
                            const metadata = extractMarkdownMetadata(content)
                            title = metadata.title
                            description = metadata.description
                        }
                    } catch (e) {
                        // Ignore missing files
                    }

                    // Process children recursively
                    const { nodes: childNodes } = await processMenuItems(value, submenuPath, 0, contentIgnore)

                    nodes.push({
                        id: `${submenuPath.split('/').filter(Boolean).pop() || 'home'}-${order}`,
                        title: title || key,
                        path: normalizeIndexPath(submenuPath),
                        type: 'link',
                        description,
                        isPrimary: true,
                        children: childNodes
                    })
                    order++
                    continue
                }

                // Handle custom title with path (alias link)
                if (typeof value === 'string') {
                    const resolvedPath = resolvePath(value, contextPath)
                    if (isIgnoredMarkdownPath(contentIgnore, resolvedPath)) {
                        continue
                    }
                    const markdownPath = getMarkdownPath(resolvedPath)
                    let description: string | undefined = undefined

                    try {
                        if (await fs.pathExists(markdownPath)) {
                            const content = await fs.readFile(markdownPath, 'utf-8')
                            const metadata = extractMarkdownMetadata(content)
                            description = metadata.description
                        }
                    } catch (e) {
                        // Ignore missing files
                    }

                    nodes.push({
                        id: `link-${key.replace(/\s+/g, '-').toLowerCase()}-${order}`,
                        title: key,
                        path: normalizeIndexPath(resolvedPath),
                        type: 'link',
                        description,
                        isPrimary: false // Aliases are NOT primary
                    })
                    order++
                }
            }
        }
    }

    return { nodes, nextOrder: order }
}

/**
 * Count total nodes in tree
 */
function countNodes(nodes: MinimalTreeNode[]): number {
    let count = nodes.length
    for (const node of nodes) {
        if (node.children) {
            count += countNodes(node.children)
        }
    }
    return count
}

async function buildFallbackNavigationTree(
    sourceDir: string,
    contentIgnore: ReturnType<typeof createContentIgnore>
): Promise<MinimalTreeNode[]> {
    const markdownFiles = await getAllMarkdownFiles(sourceDir, sourceDir, contentIgnore)
    const nodes: MinimalTreeNode[] = []

    for (const [order, filePath] of markdownFiles.sort().entries()) {
        const content = await fs.readFile(filePath, 'utf-8')
        const metadata = extractMarkdownMetadata(content)
        const urlPath = filePathToUrlPath(filePath, sourceDir)
        const title = metadata.title ?? path.basename(filePath, '.md')

        nodes.push({
            id: `${urlPath.split('/').filter(Boolean).pop() || 'home'}-${order}`,
            title,
            path: urlPath,
            type: 'link',
            description: metadata.description,
            isPrimary: true
        })
    }

    return nodes
}

/**
 * Load the menu array from a candidate config file (legacy _menu.yml/yaml or mdsite.yml).
 * Returns null if the file is missing, unreadable, has no menu key, or has an empty menu.
 */
async function tryReadMenuFromConfig(configPath: string): Promise<MdsiteMenuItem[] | null> {
    if (!await fs.pathExists(configPath)) {
        return null
    }

    try {
        const content = await fs.readFile(configPath, 'utf-8')
        const parsed = parseYaml(content) as { menu?: MdsiteMenuItem[] } | null
        if (parsed && Array.isArray(parsed.menu) && parsed.menu.length > 0) {
            return parsed.menu
        }
    } catch (e) {
        // Ignore parse errors - they shouldn't abort the whole lookup chain
    }

    return null
}

/**
 * Try to read menu items from a plain (non-wrapped) legacy _menu.yml/yaml file.
 * Returns null if the file is missing, unreadable, or doesn't contain a non-empty array.
 */
async function tryReadLegacyMenuFile(menuPath: string): Promise<MdsiteMenuItem[] | null> {
    if (!await fs.pathExists(menuPath)) {
        return null
    }

    try {
        const content = await fs.readFile(menuPath, 'utf-8')
        const parsed = parseYaml(content) as MdsiteMenuItem[] | null
        if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed
        }
    } catch (e) {
        // Ignore parse errors
    }

    return null
}

/**
 * Layered menu lookup. Tries, in order:
 *   1. MDSITE_CONFIG_PATH env var (parsed as wrapped { menu: [...] })
 *   2. <sourceDir>/mdsite.yml
 *   3. <sourceDir>/../mdsite.yml
 *   4. <sourceDir>/_menu.yml  (legacy fallback)
 *   5. <sourceDir>/_menu.yaml (legacy fallback)
 * Canonical mdsite.yml wins over legacy _menu.yml so the CLI's one-config
 * model is honored and leftover _menu.yml files don't silently override it.
 * Returns the first non-empty menu array, or null if none resolve to a menu.
 */
async function loadMenuConfig(sourceDir: string): Promise<MdsiteMenuItem[] | null> {
    const candidates: { path: string, isLegacy: boolean }[] = []

    if (process.env.MDSITE_CONFIG_PATH) {
        candidates.push({ path: process.env.MDSITE_CONFIG_PATH, isLegacy: false })
    }

    candidates.push({ path: path.join(sourceDir, 'mdsite.yml'), isLegacy: false })
    candidates.push({ path: path.join(sourceDir, '..', 'mdsite.yml'), isLegacy: false })
    candidates.push({ path: path.join(sourceDir, '_menu.yml'), isLegacy: true })
    candidates.push({ path: path.join(sourceDir, '_menu.yaml'), isLegacy: true })

    for (const candidate of candidates) {
        const menu = candidate.isLegacy
            ? await tryReadLegacyMenuFile(candidate.path)
            : await tryReadMenuFromConfig(candidate.path)
        if (menu) {
            return menu
        }
    }

    return null
}

// ----------------------------------------------------------------------------
// FOOTER LOGIC
// ----------------------------------------------------------------------------

/**
 * Runtime-validated footer entry. `null` is rendered as a vertical separator
 * in the bar; external URLs keep their raw `path` and render in a new tab;
 * internal links use the normalized path with the H1 title (or custom title).
 */
export interface FooterLink {
    path: string
    title: string
    type: 'link' | 'separator'
    isExternal: boolean
}

/**
 * Same filter the CLI uses, but expressed against `MdsiteFooterItem`. Keeps
 * CLI and renderer parsers in lockstep so both drop malformed entries the
 * same way.
 */
function isValidFooterItem(item: unknown): item is MdsiteFooterItem {
    if (item === null) return true
    if (typeof item === 'string') return item.trim().length > 0
    if (typeof item === 'object') {
        const keys = Object.keys(item as Record<string, unknown>)
        if (keys.length !== 1) return false
        const value = (item as Record<string, unknown>)[keys[0]!]
        return value === null || typeof value === 'string'
    }
    return false
}

/**
 * True when the string is an absolute http(s) URL. Used to keep external
 * links out of the menu-exclusion set (no markdown file to exclude) and to
 * open them in a new tab in the footer.
 */
function isExternalUrl(value: string): boolean {
    return value.startsWith('http://') || value.startsWith('https://')
}

/**
 * Read the footer array from a candidate mdsite.yml config file.
 * Returns null when the file is missing, unreadable, or has no footer key.
 * Footer lives under `features.footer` in mdsite.yml.
 */
async function tryReadFooterFromConfig(configPath: string): Promise<MdsiteFooterItem[] | null> {
    if (!await fs.pathExists(configPath)) {
        return null
    }

    try {
        const content = await fs.readFile(configPath, 'utf-8')
        const parsed = parseYaml(content) as { features?: { footer?: unknown } } | null
        const footerItems = parsed?.features?.footer
        if (parsed && Array.isArray(footerItems) && footerItems.length > 0) {
            return footerItems.filter(isValidFooterItem)
        }
    } catch (e) {
        // Ignore parse errors - they shouldn't abort the whole lookup chain
    }

    return null
}

/**
 * Layered footer lookup. Tries, in order:
 *   1. MDSITE_CONFIG_PATH env var
 *   2. <sourceDir>/../mdsite.yml
 *   3. <sourceDir>/mdsite.yml
 * Returns the first non-empty footer array, or null if none resolve.
 */
async function loadFooterConfig(sourceDir: string): Promise<MdsiteFooterItem[] | null> {
    const candidates: string[] = []
    if (process.env.MDSITE_CONFIG_PATH) {
        candidates.push(process.env.MDSITE_CONFIG_PATH)
    }
    candidates.push(path.join(sourceDir, '..', 'mdsite.yml'))
    candidates.push(path.join(sourceDir, 'mdsite.yml'))

    for (const candidate of candidates) {
        const footer = await tryReadFooterFromConfig(candidate)
        if (footer) {
            return footer
        }
    }

    return null
}

/**
 * Resolve a raw footer entry to its normalized URL path. Returns null when
 * the path is empty after resolution or when the entry is not a usable string.
 */
function resolveFooterPath(item: string): string | null {
    if (isExternalUrl(item)) {
        return null
    }
    const resolvedPath = resolvePath(item, '/')
    if (!resolvedPath || resolvedPath === '/') {
        return null
    }
    return normalizeIndexPath(resolvedPath)
}

/**
 * Pull the normalized internal path out of a footer item, if any. Returns
 * null for external URLs and `null`/empty items so they never get added to
 * the menu-exclusion set.
 */
function extractInternalPath(item: MdsiteFooterItem): string | null {
    if (typeof item === 'string') {
        return resolveFooterPath(item)
    }
    if (item && typeof item === 'object') {
        const keys = Object.keys(item)
        if (keys.length === 1) {
            const value = item[keys[0]!]
            if (typeof value === 'string') {
                return resolveFooterPath(value)
            }
        }
    }
    return null
}

/**
 * Process footer items into a flat list of FooterLink entries. Supports:
 *   - `null` → separator
 *   - string (file name) → internal link, title from H1
 *   - `{ title: path }` → internal link with custom title
 *   - `{ title: https://... }` → external link, opens in a new tab
 * Title falls back to the raw entry / key when the markdown file is missing
 * or has no H1.
 */
async function processFooterItems(
    items: MdsiteFooterItem[],
    contentIgnore: ReturnType<typeof createContentIgnore>
): Promise<FooterLink[]> {
    const links: FooterLink[] = []

    for (const item of items) {
        if (item === null) {
            links.push({
                path: '',
                title: '',
                type: 'separator',
                isExternal: false
            })
            continue
        }

        if (typeof item === 'string') {
            const normalizedPath = resolveFooterPath(item)
            if (!normalizedPath || isIgnoredMarkdownPath(contentIgnore, normalizedPath)) {
                continue
            }
            const title = await readH1Title(normalizedPath) ?? item
            links.push({
                path: normalizedPath,
                title,
                type: 'link',
                isExternal: false
            })
            continue
        }

        // Object form: { title: path-or-url }
        const keys = Object.keys(item)
        if (keys.length !== 1) continue
        const displayTitle = keys[0]!
        const value = item[displayTitle]

        if (value === null) {
            links.push({
                path: '',
                title: displayTitle,
                type: 'separator',
                isExternal: false
            })
            continue
        }

        if (typeof value !== 'string') continue

        if (isExternalUrl(value)) {
            links.push({
                path: value,
                title: displayTitle,
                type: 'link',
                isExternal: true
            })
            continue
        }

        const normalizedPath = resolveFooterPath(value)
        if (!normalizedPath) {
            // Custom title pointing at a non-existent page — still render it
            // using the raw value as the title so the user sees their label.
            links.push({
                path: value,
                title: displayTitle,
                type: 'link',
                isExternal: false
            })
            continue
        }
        if (isIgnoredMarkdownPath(contentIgnore, normalizedPath)) {
            continue
        }

        // Object form always wins for the title, mirroring how the `menu`
        // parser treats custom labels as overrides of the file's H1.
        links.push({
            path: normalizedPath,
            title: displayTitle,
            type: 'link',
            isExternal: false
        })
    }

    return links
}

/**
 * Read the H1 from a markdown file at the given normalized path. Returns
 * null when the file is missing or has no H1 heading.
 */
async function readH1Title(normalizedPath: string): Promise<string | null> {
    const markdownPath = getMarkdownPath(normalizedPath)
    try {
        if (await fs.pathExists(markdownPath)) {
            const content = await fs.readFile(markdownPath, 'utf-8')
            const metadata = extractMarkdownMetadata(content)
            return metadata.title
        }
    } catch (e) {
        // Ignore missing files
    }
    return null
}

/**
 * Build the set of normalized footer paths used to exclude entries from the
 * nav tree. Returns an empty set when no footer section is configured.
 */
async function getFooterExcludedPaths(sourceDir: string): Promise<Set<string>> {
    const items = await loadFooterConfig(sourceDir)
    if (!items) {
        return new Set()
    }

    const excluded = new Set<string>()
    for (const item of items) {
        const normalizedPath = extractInternalPath(item)
        if (normalizedPath) {
            excluded.add(normalizedPath)
        }
    }
    return excluded
}

/**
 * Recursively drop any node whose path matches the excluded set. Subtree children
 * of a dropped node are removed along with the parent.
 */
function filterTreeByExcludedPaths(nodes: MinimalTreeNode[], excluded: Set<string>): MinimalTreeNode[] {
    return nodes
        .filter(node => !excluded.has(node.path))
        .map(node => ({
            ...node,
            children: node.children ? filterTreeByExcludedPaths(node.children, excluded) : undefined
        }))
}

/**
 * Generate footer links JSON file
 */
export async function generateFooterJson(): Promise<void> {
    const domain = getContentDomain()
    console.log(`📎 Building footer links for: ${domain}`)

    const sourceDir = getSourceDir()
    const contentIgnore = getConfiguredContentIgnore(sourceDir)
    const items = await loadFooterConfig(sourceDir)
    const links = items ? await processFooterItems(items, contentIgnore) : []

    const targetDir = getTargetDir()
    const outputPath = path.join(targetDir, '_footer.json')

    await fs.ensureDir(targetDir)
    await fs.writeJson(outputPath, links, { spaces: 2 })

    const fileSize = (await fs.stat(outputPath)).size
    const fileSizeKB = (fileSize / 1024).toFixed(2)

    console.log(`✓ Footer links generated: ${outputPath} (${fileSizeKB} KB)`)
    console.log(`✓ Total footer links: ${links.length}\n`)
}

/**
 * Generate navigation JSON file
 */
export async function generateNavigationJson(): Promise<void> {
    const domain = getContentDomain()
    console.log(`📋 Building navigation tree for: ${domain}`)

    const sourceDir = getSourceDir()
    const contentIgnore = getConfiguredContentIgnore(sourceDir)
    let tree: MinimalTreeNode[] = []
    try {
        const menuItems = await loadMenuConfig(sourceDir)
        if (menuItems) {
            const result = await processMenuItems(menuItems, '/', 0, contentIgnore)
            tree = result.nodes
        } else {
            console.warn('⚠️ No menu found in MDSITE_CONFIG_PATH, mdsite.yml, _menu.yml, or _menu.yaml (source: ' + sourceDir + ')')
        }
    } catch (error) {
        console.error('Error building navigation tree:', error)
    }

    // Deduplicate footer entries from the menu tree (if any footer section is configured)
    const excludedPaths = await getFooterExcludedPaths(sourceDir)
    if (excludedPaths.size > 0) {
        tree = filterTreeByExcludedPaths(tree, excludedPaths)
    }

    if (tree.length === 0) {
        tree = await buildFallbackNavigationTree(sourceDir, contentIgnore)
        if (excludedPaths.size > 0) {
            tree = filterTreeByExcludedPaths(tree, excludedPaths)
        }
    }

    const targetDir = getTargetDir()
    const outputPath = path.join(targetDir, '_navigation.json')

    await fs.ensureDir(targetDir)
    await fs.writeJson(outputPath, tree, { spaces: 2 })

    const fileSize = (await fs.stat(outputPath)).size
    const fileSizeKB = (fileSize / 1024).toFixed(2)

    console.log(`✓ Navigation tree generated: ${outputPath} (${fileSizeKB} KB)`)
    console.log(`✓ Total menu items: ${countNodes(tree)}\n`)
}


// ----------------------------------------------------------------------------
// SEARCH INDEX LOGIC
// ----------------------------------------------------------------------------

export interface SearchIndexEntry {
    path: string
    title: string
    description?: string
    keywords?: string[]
    excerpt?: string
}

/**
 * Extract excerpt from markdown content (first 150 chars after frontmatter and H1)
 */
function extractExcerpt(content: string): string | undefined {
    // Remove frontmatter
    let cleanContent = content.replace(/^---\n[\s\S]*?\n---\n/, '')

    // Remove H1
    cleanContent = cleanContent.replace(/^#\s+.+$/m, '')

    // Get first paragraph, trim whitespace
    const firstParagraph = cleanContent.trim().split('\n\n')[0]
    if (!firstParagraph) return undefined

    // Trim to 150 chars
    const excerpt = firstParagraph.trim().substring(0, 150)
    return excerpt.length > 0 ? excerpt : undefined
}

/**
 * Convert file path to URL path
 */
function filePathToUrlPath(filePath: string, sourceDir: string): string {
    const relativePath = path.relative(sourceDir, filePath)
    const urlPath = '/' + relativePath
        .replace(/\.md$/, '')
        .replace(/index$/, '')
        .replace(/\\/g, '/')
        .replace(/\/+$/, '')

    return urlPath === '' ? '/' : urlPath
}

/**
 * Directory names that are never user-authored content. The recursive
 * markdown walker skips these so a content directory that happens to be
 * the project root (i.e. `mdsite.yml` lives at the repo root and
 * `paths.input` is unset) does not crawl into the renderer working dir
 * (`.mdsite/`), its `node_modules`, or other build/dependency artifacts.
 *
 * The rule is broad on purpose: any directory whose name starts with `.`
 * (hidden dirs like `.git`, `.mdsite`, `.nuxt`, `.vscode`, `.idea`,
 * `.history`, `.data`, `.output`, …) plus the two non-hidden directories
 * that are always tooling artifacts (`node_modules`, `dist`). Keeping the
 * list narrow would require enumerating every CI/editor/build tool that
 * might leave a hidden directory next to the content.
 *
 * Keep this in sync with the Nuxt Content collection `exclude` list in
 * `content.config.ts` — both are the same safety net at two layers.
 */
function isExcludedSourceDir(name: string): boolean {
    return name.startsWith('.') || name === 'node_modules' || name === 'dist'
}

/**
 * Get all markdown files recursively, skipping build/dependency directories
 * (see `isExcludedSourceDir`).
 */
async function getAllMarkdownFiles(
    dir: string,
    sourceDir: string,
    contentIgnore: ReturnType<typeof createContentIgnore>
): Promise<string[]> {
    const files: string[] = []

    if (!await fs.pathExists(dir)) {
        return files
    }

    const items = await fs.readdir(dir)

    for (const item of items) {
        const itemPath = path.join(dir, item)
        const stat = await fs.stat(itemPath)

        if (stat.isDirectory()) {
            const relativeDir = path.relative(sourceDir, itemPath).replaceAll(path.sep, '/')
            if (isExcludedSourceDir(item) || matches(contentIgnore, `${relativeDir}/`)) {
                continue
            }
            const subFiles = await getAllMarkdownFiles(itemPath, sourceDir, contentIgnore)
            files.push(...subFiles)
        } else if (
            item.endsWith('.md')
            && !item.endsWith('.draft.md')
            && !matches(contentIgnore, path.relative(sourceDir, itemPath).replaceAll(path.sep, '/'))
        ) {
            // Only include published markdown files
            files.push(itemPath)
        }
    }

    return files
}

/**
 * Generate search index JSON file
 */
export async function generateSearchIndexJson(): Promise<void> {
    const domain = getContentDomain()
    console.log(`🔍 Building search index for: ${domain}`)

    const sourceDir = getSourceDir()
    const contentIgnore = getConfiguredContentIgnore(sourceDir)
    const markdownFiles = await getAllMarkdownFiles(sourceDir, sourceDir, contentIgnore)

    const index: SearchIndexEntry[] = []

    for (const filePath of markdownFiles) {
        try {
            const content = await fs.readFile(filePath, 'utf-8')
            const metadata = extractMarkdownMetadata(content)
            const excerpt = extractExcerpt(content)
            const urlPath = filePathToUrlPath(filePath, sourceDir)

            // Skip files without H1 (malformed)
            if (!metadata.title) {
                console.warn(`⚠️  No H1 found in: ${path.relative(sourceDir, filePath)}`)
                continue
            }

            index.push({
                path: urlPath,
                title: metadata.title,
                description: metadata.description,
                keywords: metadata.keywords,
                excerpt
            })
        } catch (error) {
            console.error(`❌ Failed to process ${filePath}:`, error)
        }
    }

    const targetDir = getTargetDir()
    const outputPath = path.join(targetDir, '_search-index.json')

    await fs.ensureDir(targetDir)
    await fs.writeJson(outputPath, index, { spaces: 2 })

    const fileSize = (await fs.stat(outputPath)).size
    const fileSizeKB = (fileSize / 1024).toFixed(2)

    console.log(`✓ Search index generated: ${outputPath} (${fileSizeKB} KB)`)
    console.log(`✓ Total indexed pages: ${index.length}\n`)
}

// ----------------------------------------------------------------------------
// MAIN EXECUTION
// ----------------------------------------------------------------------------

export async function buildContentData(): Promise<void> {
    await generateNavigationJson()
    await generateSearchIndexJson()
    await generateFooterJson()
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    buildContentData().catch((error) => {
        console.error(error)
        process.exit(1)
    })
}
