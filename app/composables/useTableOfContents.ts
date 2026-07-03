export interface TocItem {
  id: string
  text: string
  level: number
  element?: HTMLElement
}

/** Minimum number of headings required to show the TOC. */
export const TOC_MIN_HEADINGS = 3
/** Minimum number of non-empty lines in the rendered content required to show the TOC. */
export const TOC_MIN_LINES = 15

/**
 * Pure helper that decides whether the TOC should be shown.
 * Returns true when the page has enough headings AND enough content lines.
 * A null lineCount (not yet measured) is treated as "not too short" so the
 * TOC is not hidden by the line threshold before measurement completes.
 */
export function computeShouldShowTOC(headingsCount: number, lineCount: number | null): boolean {
  if (headingsCount < TOC_MIN_HEADINGS) return false
  if (lineCount !== null && lineCount < TOC_MIN_LINES) return false
  return true
}

/**
 * Generate and manage table of contents from page headings
 */
export function useTableOfContents() {
  const tocItems = ref<TocItem[]>([])
  const activeId = ref<string>('')
  const observer = ref<IntersectionObserver | null>(null)
  const lineCount = ref<number | null>(null)

  /**
   * Generate TOC from a content container element
   * @param container - HTML element containing the rendered content
   */
  function generateTOC(container: HTMLElement | null) {
    // Clear existing TOC first
    tocItems.value = []

    // Disconnect existing observer
    if (observer.value) {
      observer.value.disconnect()
      observer.value = null
    }

    if (!container) {
      // Reset line count when no container is provided so a stale value
      // does not gate TOC visibility after the container is unmounted.
      lineCount.value = null
      return
    }

    // Measure line count of the rendered content (non-empty lines).
    // Always update this even when there are too few headings so the value
    // stays in sync with the latest rendered content.
    const text = container.innerText || ''
    lineCount.value = text.split('\n').filter(l => l.trim().length > 0).length

    // Find only H2 and H3 headings (skip H1 as it's the page title)
    const headings = container.querySelectorAll('article h2, article h3, .content-body h2, .content-body h3')

    if (headings.length < TOC_MIN_HEADINGS) {
      // Hide TOC if fewer than the minimum required headings
      tocItems.value = []
      return
    }

    // Build TOC items (H2 = level 1, H3 = level 2)
    const items: TocItem[] = []

    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.charAt(1))

      // H2 = level 1, H3 = level 2
      const normalizedLevel = level === 2 ? 1 : 2

      // Ensure heading has an id for anchor links
      let id = heading.id
      if (!id) {
        id = `heading-${index}-${heading.textContent?.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '') || index}`
        heading.id = id
      }

      items.push({
        id,
        text: heading.textContent || '',
        level: normalizedLevel,
        element: heading as HTMLElement
      })
    })

    tocItems.value = items

    // Set up intersection observer for active heading tracking
    setupObserver(items)
  }

  /**
   * Set up IntersectionObserver to track active heading
   */
  function setupObserver(items: TocItem[]) {
    // Clean up existing observer
    if (observer.value) {
      observer.value.disconnect()
    }

    if (items.length === 0) return

    const options = {
      rootMargin: '-100px 0px -66%',
      threshold: 0
    }

    observer.value = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          activeId.value = entry.target.id
        }
      })
    }, options)

    // Observe all heading elements
    items.forEach(item => {
      if (item.element) {
        observer.value!.observe(item.element)
      }
    })
  }

  /**
   * Scroll to a specific heading
   */
  function scrollToHeading(id: string) {
    const element = document.getElementById(id)
    if (element) {
      const offsetTop = element.offsetTop - 80 // Account for app bar height
      window.scrollTo({
        top: offsetTop,
        behavior: 'smooth'
      })
      activeId.value = id
    }
  }

  /**
   * Check if TOC should be shown based on heading count and content line count.
   */
  const shouldShowTOC = computed(() => computeShouldShowTOC(tocItems.value.length, lineCount.value))

  /**
   * Clean up observer on unmount
   */
  onUnmounted(() => {
    if (observer.value) {
      observer.value.disconnect()
    }
  })

  return {
    tocItems,
    activeId,
    lineCount,
    shouldShowTOC,
    generateTOC,
    scrollToHeading
  }
}
