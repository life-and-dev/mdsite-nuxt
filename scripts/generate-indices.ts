#!/usr/bin/env node

import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { parse as parseYaml } from 'yaml'
import type { MdsiteMenuItem } from '../utils/mdsite-config'

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
    order: number = 0
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
                    const { nodes: childNodes } = await processMenuItems(value, submenuPath, 0)

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

async function buildFallbackNavigationTree(sourceDir: string): Promise<MinimalTreeNode[]> {
    const markdownFiles = await getAllMarkdownFiles(sourceDir)
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
 *   1. <sourceDir>/_menu.yml
 *   2. <sourceDir>/_menu.yaml
 *   3. MDSITE_CONFIG_PATH env var (parsed as wrapped { menu: [...] })
 *   4. <sourceDir>/../mdsite.yml
 *   5. <sourceDir>/mdsite.yml
 * Returns the first non-empty menu array, or null if none resolve to a menu.
 */
async function loadMenuConfig(sourceDir: string): Promise<MdsiteMenuItem[] | null> {
    const candidates: { path: string, isLegacy: boolean }[] = [
        { path: path.join(sourceDir, '_menu.yml'), isLegacy: true },
        { path: path.join(sourceDir, '_menu.yaml'), isLegacy: true }
    ]

    if (process.env.MDSITE_CONFIG_PATH) {
        candidates.push({ path: process.env.MDSITE_CONFIG_PATH, isLegacy: false })
    }

    candidates.push({ path: path.join(sourceDir, '..', 'mdsite.yml'), isLegacy: false })
    candidates.push({ path: path.join(sourceDir, 'mdsite.yml'), isLegacy: false })

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

export interface FooterLink {
    path: string
    title: string
}

/**
 * Read the footer array from a candidate mdsite.yml config file.
 * Returns null when the file is missing, unreadable, or has no footer key.
 */
async function tryReadFooterFromConfig(configPath: string): Promise<string[] | null> {
    if (!await fs.pathExists(configPath)) {
        return null
    }

    try {
        const content = await fs.readFile(configPath, 'utf-8')
        const parsed = parseYaml(content) as { footer?: unknown } | null
        if (parsed && Array.isArray(parsed.footer) && parsed.footer.length > 0) {
            return parsed.footer.filter((item): item is string => typeof item === 'string')
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
async function loadFooterConfig(sourceDir: string): Promise<string[] | null> {
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
 * Resolve a raw footer entry to its normalized URL path. Returns null when the
 * path is empty after resolution.
 */
function resolveFooterPath(item: string): string | null {
    const resolvedPath = resolvePath(item, '/')
    if (!resolvedPath || resolvedPath === '/') {
        return null
    }
    return normalizeIndexPath(resolvedPath)
}

/**
 * Process footer items into a flat list of { path, title } links.
 * Title falls back to the raw entry when the markdown file is missing or has no H1.
 */
async function processFooterItems(items: string[]): Promise<FooterLink[]> {
    const links: FooterLink[] = []

    for (const item of items) {
        const normalizedPath = resolveFooterPath(item)
        if (!normalizedPath) {
            continue
        }

        const markdownPath = getMarkdownPath(normalizedPath)
        let title: string | null = null

        try {
            if (await fs.pathExists(markdownPath)) {
                const content = await fs.readFile(markdownPath, 'utf-8')
                const metadata = extractMarkdownMetadata(content)
                title = metadata.title
            }
        } catch (e) {
            // Ignore missing files
        }

        links.push({
            path: normalizedPath,
            title: title || item
        })
    }

    return links
}

/**
 * Build the set of normalized footer paths used to exclude entries from the nav tree.
 * Returns an empty set when no footer section is configured.
 */
async function getFooterExcludedPaths(sourceDir: string): Promise<Set<string>> {
    const items = await loadFooterConfig(sourceDir)
    if (!items) {
        return new Set()
    }

    const excluded = new Set<string>()
    for (const item of items) {
        const normalizedPath = resolveFooterPath(item)
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
export async function generateFooterJson() {
    const domain = getContentDomain()
    console.log(`📎 Building footer links for: ${domain}`)

    const sourceDir = getSourceDir()
    const items = await loadFooterConfig(sourceDir)
    const links = items ? await processFooterItems(items) : []

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
export async function generateNavigationJson() {
    const domain = getContentDomain()
    console.log(`📋 Building navigation tree for: ${domain}`)

    const sourceDir = getSourceDir()
    let tree: MinimalTreeNode[] = []
    try {
        const menuItems = await loadMenuConfig(sourceDir)
        if (menuItems) {
            const result = await processMenuItems(menuItems, '/')
            tree = result.nodes
        } else {
            console.warn('⚠️ No menu found in _menu.yml, _menu.yaml, MDSITE_CONFIG_PATH, or mdsite.yml (source: ' + sourceDir + ')')
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
        tree = await buildFallbackNavigationTree(sourceDir)
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
 * Get all markdown files recursively
 */
async function getAllMarkdownFiles(dir: string): Promise<string[]> {
    const files: string[] = []

    if (!await fs.pathExists(dir)) {
        return files
    }

    const items = await fs.readdir(dir)

    for (const item of items) {
        const itemPath = path.join(dir, item)
        const stat = await fs.stat(itemPath)

        if (stat.isDirectory()) {
            const subFiles = await getAllMarkdownFiles(itemPath)
            files.push(...subFiles)
        } else if (item.endsWith('.md') && !item.endsWith('.draft.md')) {
            // Only include published markdown files
            files.push(itemPath)
        }
    }

    return files
}

/**
 * Generate search index JSON file
 */
export async function generateSearchIndexJson() {
    const domain = getContentDomain()
    console.log(`🔍 Building search index for: ${domain}`)

    const sourceDir = getSourceDir()
    const markdownFiles = await getAllMarkdownFiles(sourceDir)

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

export async function buildContentData() {
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
