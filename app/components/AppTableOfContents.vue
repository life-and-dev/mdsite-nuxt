<template>
  <!--
    Guard at the root: the consuming composable's `shouldShowTOC` already
    requires `tocItems.length >= TOC_MIN_HEADINGS (3)`, so by the time we
    reach this template a usable TOC is guaranteed. Render nothing otherwise.
  -->
  <div
    v-if="tocItems.length >= 3"
    class="toc-sidebar"
    ref="tocContainer"
  >
    <!-- Header -->
    <h3 v-if="showHeader" class="toc-header">On This Page</h3>
    <v-divider v-if="showHeader" class="mb-2" />

    <!-- TOC Items -->
    <nav class="toc-nav">
      <TocItem
        v-for="item in tocItems"
        :key="item.id"
        :item="item"
        :is-active="activeId === item.id"
        @click="handleItemClick(item.id)"
      />
    </nav>

    <!-- Fade gradient for overflow -->
    <div v-if="showFade" class="fade-gradient" />
  </div>
</template>

<script setup lang="ts">
import type { TocItem as TocItemType } from '~/composables/useTableOfContents'

const props = withDefaults(
  defineProps<{
    tocItems: TocItemType[]
    activeId: string
    showHeader?: boolean
  }>(),
  {
    showHeader: true
  }
)

const emit = defineEmits<{
  'item-click': [id: string]
}>()

const { scrollToHeading } = useTableOfContents()

const tocContainer = ref<HTMLElement>()
const showFade = ref(false)

/**
 * Handle TOC item click
 */
function handleItemClick(id: string) {
  scrollToHeading(id)
  emit('item-click', id)
}

/**
 * Check if content overflows
 */
function checkOverflow() {
  if (!tocContainer.value) return

  const hasOverflow = tocContainer.value.scrollHeight > tocContainer.value.clientHeight
  showFade.value = hasOverflow
}

// Set up ResizeObserver to detect overflow
onMounted(() => {
  if (!tocContainer.value) return

  const resizeObserver = new ResizeObserver(() => {
    checkOverflow()
  })

  resizeObserver.observe(tocContainer.value)

  onUnmounted(() => {
    resizeObserver.disconnect()
  })
})

// Check overflow when items change
watch(() => props.tocItems, () => {
  nextTick(() => checkOverflow())
})
</script>

<style scoped>
.toc-sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background-color: rgb(var(--v-theme-surface-rail));
  padding: 16px 12px;
}

.toc-header {
  font-size: 0.875rem;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface-rail));
  margin-bottom: 8px;
  padding: 0 4px;
}

.toc-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

/* Hide scrollbar but keep functionality */
.toc-nav::-webkit-scrollbar {
  display: none;
}

.toc-nav {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.fade-gradient {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  background: linear-gradient(
    to bottom,
    transparent,
    rgb(var(--v-theme-surface-rail))
  );
  pointer-events: none;
  z-index: 10;
}
</style>
