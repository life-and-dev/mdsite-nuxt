<template>
  <!--
    In-flow footer: rendered inside <v-main> by the default layout, so it sits
    at the end of the article and only becomes visible after the user scrolls
    all the way down. Not a fixed/anchored bar.
  -->
  <v-footer
    v-if="hasFooterEntries"
    class="app-footer"
    color="surface-appbar"
    border="top"
  >
    <v-container class="d-flex justify-center align-center py-3">
      <div class="footer-links">
        <template v-for="(link, index) in footerHrefs" :key="linkKey(link, index)">
          <!-- Separator (null entry in mdsite.yml) -->
          <v-divider
            v-if="link.type === 'separator'"
            vertical
            class="mx-2 footer-separator"
          />
          <!-- Internal link or external URL -->
          <v-btn
            v-else
            :href="link.path"
            variant="text"
            color="on-surface-appbar"
            class="footer-link"
            :target="link.isExternal ? '_blank' : undefined"
            :rel="link.isExternal ? 'noopener noreferrer' : undefined"
          >
            {{ link.title }}
            <v-icon
              v-if="link.isExternal"
              icon="mdi-open-in-new"
              size="14"
              class="ml-1 external-icon"
            />
          </v-btn>
          <v-divider
            v-if="shouldRenderInterDivider(link, index)"
            vertical
            class="mx-2"
          />
        </template>
        <v-btn
          v-if="editUrl"
          :href="editUrl"
          variant="text"
          color="on-surface-appbar"
          class="footer-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          Edit
        </v-btn>
      </div>
    </v-container>
  </v-footer>
</template>

<script setup lang="ts">
import { useSourceEdit } from '~/composables/useSourceEdit';
import { useFooter } from '~/composables/useFooter'
import { withBasePath } from '../../utils/base-url'

interface FooterHref {
  path: string
  title: string
  type: 'link' | 'separator'
  isExternal: boolean
}

const appBaseURL = useRuntimeConfig().app.baseURL
const { getEditUrl } = useSourceEdit()
const { links: footerLinks } = useFooter()

const editUrl = computed(() => getEditUrl())

// Render the bar only after the footer JSON has loaded and contains at least
// one entry. While loading (links is the default empty array) or when the
// array is empty, the whole bar (including the Edit button) is hidden.
const hasFooterEntries = computed(() =>
  (footerLinks.value?.length ?? 0) > 0
)

/**
 * Map raw FooterLink entries into the shape the template renders. External
 * URLs keep their raw path (withBasePath passes http(s) through unchanged);
 * internal links get the app base path prepended.
 */
const footerHrefs = computed<FooterHref[]>(() => (footerLinks.value ?? []).map(link => ({
  path: withBasePath(link.path, appBaseURL),
  title: link.title,
  type: link.type,
  isExternal: link.isExternal
})))

/**
 * Stable key for the v-for. External URLs and separators can have empty or
 * colliding paths, so fall back to the index to guarantee uniqueness.
 */
function linkKey(link: FooterHref, index: number): string {
  if (link.path) return link.path
  return `${link.type}-${index}`
}

/**
 * The original layout rendered a trailing v-divider after every entry (except
 * the last) plus an extra one before the Edit button. With separators now
 * living inside the entries themselves, only render the inter-entry divider
 * when the NEXT item is a link — otherwise two visual dividers would stack
 * (e.g. between a separator and the Edit button or between two separators).
 */
function shouldRenderInterDivider(link: FooterHref, index: number): boolean {
  if (link.type === 'separator') return false
  const next = footerHrefs.value[index + 1]
  if (next && next.type === 'separator') return false
  // Preserve the original "always add a divider before Edit" behavior.
  return Boolean(editUrl.value) || index < footerHrefs.value.length - 1
}
</script>

<style scoped>
.footer-links {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.footer-link {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}

.external-icon {
  opacity: 0.7;
  vertical-align: middle;
}

.footer-separator {
  opacity: 0.3;
}

/* Make dividers visible with theme colors */
:deep(.v-divider) {
  opacity: 0.3;
  height: 1.5rem;
}

/* Print: Hide Footer (also covered by the layout's `.v-footer` rule,
   but kept here as a defensive scoped fallback). */
@media print {
  .app-footer {
    display: none !important;
  }
}
</style>
