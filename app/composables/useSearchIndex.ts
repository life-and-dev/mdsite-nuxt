import type { SearchIndexEntry } from '../../scripts/generate-indices'
import { withBasePath } from '../../utils/base-url'

/**
 * Fetch and cache search index from pre-built JSON file
 * Uses useState to prevent duplicate fetches across component instances
 */
export function useSearchIndex() {
  const appBaseURL = useRuntimeConfig().app.baseURL
  // Cache search index using useState (shared across all components)
  const searchIndex = useState<SearchIndexEntry[] | null>('search-index', () => null)
  const isLoading = useState<boolean>('search-index-loading', () => false)

  /**
   * Load search index from pre-built JSON file
   * Cached result prevents duplicate fetches
   */
  async function loadSearchIndex(): Promise<SearchIndexEntry[]> {
    // Return cached index if available
    if (searchIndex.value !== null) {
      return searchIndex.value
    }

    // Return empty array if already loading (prevents race condition)
    if (isLoading.value) {
      return []
    }

    isLoading.value = true

    try {
      const index = await $fetch<SearchIndexEntry[]>(withBasePath('/_search-index.json', appBaseURL))
      searchIndex.value = index
      return index
    } catch (error) {
      console.error('Error loading search index:', error)
      searchIndex.value = []
      return []
    } finally {
      isLoading.value = false
    }
  }

  return {
    searchIndex,
    isLoading,
    loadSearchIndex
  }
}
