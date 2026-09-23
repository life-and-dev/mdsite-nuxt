<template>
  <div class="mermaid-container">
    <div v-if="!svg" class="mermaid-loading">
      <v-progress-circular indeterminate size="24"></v-progress-circular>
      <span>Rendering diagram...</span>
    </div>
    <div v-html="svg" ref="container" class="mermaid-content"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useTheme } from 'vuetify'
import { initializeMermaid, watchMermaidTheme } from '../../utils/mermaid-theme'
import { runAfterDocumentFontsReady } from './mermaid-fonts'

const props = defineProps({
  code: {
    type: String,
    required: true
  }
})

const svg = ref('')
const container = ref<HTMLElement | null>(null)

const theme = useTheme()
let isMounted = false
let latestRender = 0

const renderDiagram = async (): Promise<void> => {
  if (process.server) return

  const renderNumber = ++latestRender

  await runAfterDocumentFontsReady(document, async () => {
    if (!isMounted || renderNumber !== latestRender) return

    try {
      const mermaid = (await import('mermaid')).default
      if (!isMounted || renderNumber !== latestRender) return
      initializeMermaid(mermaid, theme.current.value.colors)

      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
      const { svg: renderedSvg } = await mermaid.render(id, props.code)
      if (!isMounted || renderNumber !== latestRender) return
      svg.value = renderedSvg
    } catch (error) {
      if (!isMounted || renderNumber !== latestRender) return
      console.error('Mermaid rendering failed:', error)
      svg.value = `<div class="error">Failed to render diagram: ${error}</div>`
    }
  })
}

onMounted(() => {
  isMounted = true
  renderDiagram()
})

watch(() => props.code, () => {
  renderDiagram()
})

const stopWatchingTheme = watchMermaidTheme(() => theme.current.value, renderDiagram)

onUnmounted(() => {
  stopWatchingTheme()
  isMounted = false
  latestRender++
})
</script>

<style scoped>
.mermaid-container {
  display: flex;
  justify-content: center;
  margin: 1.5rem 0;
  padding: 1rem;
  background-color: rgb(var(--v-theme-surface));
  border-radius: 12px;
  overflow-x: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}

.mermaid-loading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgb(var(--v-theme-on-surface-variant));
  font-style: italic;
}

.mermaid-content {
  width: 100%;
  min-width: 0;
}

.mermaid-content:empty {
  display: none;
}

:deep(svg) {
  display: block;
  width: auto;
  max-width: none;
  height: auto;
  margin-inline: auto;
}

:deep(svg .edgeLabel text),
:deep(svg .edgeLabel tspan) {
  paint-order: stroke fill;
  stroke: rgba(var(--v-theme-surface), 0.75);
  stroke-width: 5px;
  stroke-linejoin: round;
}

:deep(svg .edgeLabel rect) {
  visibility: hidden;
}

.error {
  color: var(--v-theme-error);
  padding: 1rem;
  font-family: monospace;
}

@media print {
  .mermaid-container {
    background: white !important;
    border: 1px solid #ccc !important;
    box-shadow: none !important;
    margin: 1rem 0 !important;
    padding: 0 !important;
  }

  :deep(svg) {
    background: white !important;
  }

  :deep(svg text),
  :deep(svg tspan) {
    fill: black !important;
  }

  :deep(svg .edgeLabel text),
  :deep(svg .edgeLabel tspan) {
    stroke: #fff;
  }

  :deep(svg .node rect),
  :deep(svg .node circle),
  :deep(svg .node ellipse),
  :deep(svg .node polygon),
  :deep(svg .node path),
  :deep(svg .cluster rect),
  :deep(svg .edgeLabel rect),
  :deep(svg .stateGroup rect),
  :deep(svg .stateGroup circle),
  :deep(svg .statediagram-state rect),
  :deep(svg .state-start circle),
  :deep(svg .state-end circle),
  :deep(svg .state-end path),
  :deep(svg .state-note rect),
  :deep(svg rect.actor),
  :deep(svg .labelBox),
  :deep(svg rect.note),
  :deep(svg .activation0),
  :deep(svg .activation1),
  :deep(svg .activation2),
  :deep(svg .classGroup rect),
  :deep(svg rect.section),
  :deep(svg rect.task),
  :deep(svg rect[class^="task"]) {
    fill: white !important;
    stroke: black !important;
  }

  :deep(svg .flowchart-link),
  :deep(svg .edgePath path),
  :deep(svg .edge-thickness-normal),
  :deep(svg .edge-thickness-thick),
  :deep(svg .edge-pattern-solid),
  :deep(svg .edge-pattern-dashed),
  :deep(svg .edge-pattern-dotted),
  :deep(svg .messageLine0),
  :deep(svg .messageLine1),
  :deep(svg .actor-line),
  :deep(svg .loopLine),
  :deep(svg .transition),
  :deep(svg .classGroup line),
  :deep(svg .relation),
  :deep(svg .grid .tick line) {
    stroke: black !important;
  }

  :deep(svg marker path) {
    fill: black !important;
    stroke: black !important;
  }
}
</style>
