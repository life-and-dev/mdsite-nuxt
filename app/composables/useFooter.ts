import type { FooterLink } from '../../scripts/generate-indices'
import { withBasePath } from '../../utils/base-url'

/**
 * Fetch and cache footer links from the pre-built JSON file.
 * Uses useState to prevent duplicate fetches across component instances.
 */
export function useFooter() {
  const appBaseURL = useRuntimeConfig().app.baseURL
  const links = useState<FooterLink[] | null>('footer-links', () => null)
  const isLoading = useState<boolean>('footer-links-loading', () => false)

  /**
   * Load footer links from the pre-built JSON file.
   * Cached result prevents duplicate fetches.
   */
  async function loadFooter(): Promise<FooterLink[]> {
    if (links.value !== null) {
      return links.value
    }

    if (isLoading.value) {
      return []
    }

    isLoading.value = true

    try {
      const data = await $fetch<FooterLink[]>(withBasePath('/_footer.json', appBaseURL))
      links.value = data
      return data
    } catch (error) {
      console.error('Error loading footer links:', error)
      links.value = []
      return []
    } finally {
      isLoading.value = false
    }
  }

  return {
    links,
    isLoading,
    loadFooter
  }
}
