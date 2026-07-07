<template>
  <article>
    <div v-if="pending" class="text-center py-8">
      <v-progress-circular indeterminate color="primary"></v-progress-circular>
    </div>
    <div v-else>
      <div class="content-body">
        <ContentRenderer :value="page" />
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { withBasePath } from '../../utils/base-url'
const route = useRoute()

// Query content using Nuxt Content v3 API
// server: true = Only query during SSR/prerendering, never on client
// This prevents 3.5MB database download - client uses prerendered HTML
const { data: page, pending } = await useAsyncData(
  `content-${route.path}`,
  () => queryCollection('content').path(route.path).first(),
  { server: true }
)

// When no content matches the route, throw a fatal 404 so that:
//  - SSR/dev shows the Nuxt error page with a real 404 status
//  - `nuxi generate` (with crawlLinks) SKIPS the route instead of writing
//    a 200-OK "Page not found" HTML file. This prevents phantom routes
//    discovered by crawling relative links (e.g. ../package.json) from
//    being written to disk as directories that collide with reserved
//    filenames and break `npx serve` during preview.
if (!page.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Page not found',
    fatal: true,
  })
}

const siteConfig = useSiteConfig()
const title = page.value?.title || 'Page'
const description = page.value?.description || ''
const appBaseURL = useRuntimeConfig().app.baseURL

useHead(() => ({
  title,
  htmlAttrs: { lang: 'en' },
  meta: [
    { name: 'description', content: description },
    { name: 'keywords', content: page.value?.keywords?.join(', ') || '' },
    { name: 'robots', content: 'index, follow' },
    { name: 'theme-color', content: siteConfig.themeColorLight, media: '(prefers-color-scheme: light)' },
    { name: 'theme-color', content: siteConfig.themeColorDark, media: '(prefers-color-scheme: dark)' },
    // Open Graph
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: siteConfig.siteCanonical ? `${siteConfig.siteCanonical}${route.path}` : withBasePath(route.path, appBaseURL) },
    { property: 'og:type', content: 'article' },
    { property: 'og:image', content: withBasePath('/icon-512.png', appBaseURL) }
  ],
  link: [
    ...(siteConfig.siteCanonical ? [{ rel: 'canonical', href: `${siteConfig.siteCanonical}${route.path}` }] : [])
  ]
}))

// Post-process content: Bible tooltips + TOC generation
useContentPostProcessing(page)
</script>
