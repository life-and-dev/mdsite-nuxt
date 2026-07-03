<template>
  <v-app-bar
    v-if="hasFooterEntries"
    location="bottom"
    height="56"
    class="app-footer"
    flat
  >
    <v-container class="d-flex justify-center align-center">
      <div class="footer-links">
        <template v-for="(link, index) in footerHrefs" :key="link.path">
          <v-btn
            :href="link.path"
            variant="text"
            color="on-surface-appbar"
            class="footer-link"
          >
            {{ link.title }}
          </v-btn>
          <v-divider
            v-if="index < footerHrefs.length - 1 || editUrl"
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
  </v-app-bar>
</template>

<script setup lang="ts">
import { useSourceEdit } from '~/composables/useSourceEdit';
import { useFooter } from '~/composables/useFooter'
import { withBasePath } from '../../utils/base-url'

const appBaseURL = useRuntimeConfig().app.baseURL
const { getEditUrl } = useSourceEdit()
const { links: footerLinks, loadFooter } = useFooter()

const editUrl = computed(() => getEditUrl())

// Render the bar only after the footer JSON has loaded and contains at least
// one entry. While loading (links === null) or when the array is empty, the
// whole bar (including the Edit button) is hidden.
const hasFooterEntries = computed(() =>
  footerLinks.value !== null && footerLinks.value.length > 0
)

const footerHrefs = computed(() => (footerLinks.value ?? []).map(link => ({
  path: withBasePath(link.path, appBaseURL),
  title: link.title
})))

onMounted(async () => {
  await loadFooter()
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
