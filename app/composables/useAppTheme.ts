import { useTheme as useVuetifyTheme } from 'vuetify'

export type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'theme-preference'

export const useAppTheme = () => {
  const vuetifyTheme = useVuetifyTheme()

  // Get the current theme preference from localStorage
  const getStoredTheme = (): ThemeMode | null => {
    if (import.meta.client) {
      const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode
      return stored && ['light', 'dark'].includes(stored) ? stored : null
    }
    return null
  }

  // Get system theme preference
  const getSystemTheme = (): ThemeMode => {
    if (import.meta.client && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  }

  // Store theme preference in localStorage
  const setStoredTheme = (theme: ThemeMode) => {
    if (import.meta.client) {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
  }

  // Read the data-mdsite-theme marker set by the inline head script before paint.
  const readMarkerTheme = (): ThemeMode | null => {
    if (!import.meta.client) return null
    const attr = document.documentElement.getAttribute('data-mdsite-theme')
    return attr === 'light' || attr === 'dark' ? attr : null
  }

  // Mirror the active theme onto the <html> marker so the inline override CSS
  // (and the next paint) stay consistent with Vuetify's runtime state.
  const writeMarkerTheme = (theme: ThemeMode): void => {
    if (import.meta.client) {
      document.documentElement.setAttribute('data-mdsite-theme', theme)
    }
  }

  // Reactive theme preference
  const themePreference = ref<ThemeMode>('light')

  // Apply theme to Vuetify
  const applyTheme = (theme: ThemeMode) => {
    // Use the new Vuetify 3.7+ API: theme.change()
    if (vuetifyTheme && typeof (vuetifyTheme as any).change === 'function') {
      (vuetifyTheme as any).change(theme)
    } else if (vuetifyTheme.global) {
      // Fallback for older versions
      vuetifyTheme.global.name.value = theme
    }
  }

  // Set theme preference and apply it
  const setTheme = (theme: ThemeMode) => {
    themePreference.value = theme
    setStoredTheme(theme)
    applyTheme(theme)
    writeMarkerTheme(theme)
  }

  // Toggle between light and dark
  const toggleTheme = () => {
    const newTheme: ThemeMode = themePreference.value === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }

  // Initialize theme on mount
  onMounted(() => {
    const storedTheme = getStoredTheme()
    // Prefer the inline head-script marker: it already encoded stored-or-system
    // before first paint, so reading it here keeps the composable in lockstep
    // with the color override that the user actually saw.
    const initialTheme = readMarkerTheme() ?? storedTheme ?? getSystemTheme()

    themePreference.value = initialTheme
    applyTheme(initialTheme)

    // Listen for system theme changes if no user preference
    if (import.meta.client && !storedTheme) {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      media.addEventListener('change', (e) => {
        // Only follow the system while the user hasn't chosen a preference.
        if (!getStoredTheme()) {
          const newSystemTheme = e.matches ? 'dark' : 'light'
          themePreference.value = newSystemTheme
          applyTheme(newSystemTheme)
          writeMarkerTheme(newSystemTheme)
        }
      })
    }
  })

  return {
    themePreference: readonly(themePreference),
    setTheme,
    toggleTheme,
  }
}
