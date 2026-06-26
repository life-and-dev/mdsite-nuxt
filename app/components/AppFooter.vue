<template>
  <v-app-bar
    location="bottom"
    height="56"
    class="app-footer"
    flat
  >
    <v-container class="d-flex justify-center align-center">
      <div class="footer-links">
        <v-btn
          v-if="hasAboutPage"
          :href="aboutLink"
          variant="text"
          color="on-surface-appbar"
          class="footer-link"
        >
          About
        </v-btn>

        <v-divider v-if="hasAboutPage && hasDisclaimerPage" vertical class="mx-2" />

        <v-btn
          v-if="hasDisclaimerPage"
          :href="disclaimerLink"
          variant="text"
          color="on-surface-appbar"
          class="footer-link"
        >
          Disclaimer
        </v-btn>

        <v-divider v-if="showEditDivider" vertical class="mx-2" />

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
  </v-app-bar>
</template>

<script setup lang="ts">
import { useSourceEdit } from '~/composables/useSourceEdit';
import { useSearchIndex } from '~/composables/useSearchIndex'
import { withBasePath } from '../../utils/base-url'

const appBaseURL = useRuntimeConfig().app.baseURL
const { getEditUrl } = useSourceEdit()
const { loadSearchIndex } = useSearchIndex()
const footerPagePaths = ref<string[]>([])

// Generate links to root content files
const aboutLink = computed(() => withBasePath('/about', appBaseURL))
const disclaimerLink = computed(() => withBasePath('/disclaimer', appBaseURL))
const editUrl = computed(() => getEditUrl())
const hasAboutPage = computed(() => footerPagePaths.value.includes('/about'))
const hasDisclaimerPage = computed(() => footerPagePaths.value.includes('/disclaimer'))
const showEditDivider = computed(() => editUrl.value && (hasAboutPage.value || hasDisclaimerPage.value))

onMounted(async () => {
  const searchIndex = await loadSearchIndex()
  footerPagePaths.value = searchIndex.map(entry => entry.path)
})
</script>

<style scoped>
.app-footer {
  z-index: 1000 !important;
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.footer-link {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
}

/* Make dividers visible with theme colors */
:deep(.v-divider) {
  opacity: 0.3;
  height: 1.5rem;
}

/* Print: Hide Footer */
@media print {
  .app-footer {
    display: none !important;
  }
}
</style>
