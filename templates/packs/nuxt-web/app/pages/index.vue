<script setup lang="ts">
// Route policy lives ON the route. The default-deny middleware reads this the day
// auth lands (docs-architecture/SEO_AND_ROUTING.md §2) — the convention starts day one.
definePageMeta({ auth: false })

useSeoMeta({
  title: '{{PROJECT_NAME}}',
  description: '{{PROJECT_NAME}} — replace with the real value proposition.',
})

// Demo state only. Real pages fetch in setup with useAsyncData (SSR-rendered),
// never in onMounted — see docs-architecture/CONVENTIONS.md §4.
const clicks = ref(0)
</script>

<template>
  <main class="home">
    <h1>{{PROJECT_NAME}}</h1>
    <p>Skeleton is alive. Replace this page with your first vertical slice (DELIVERY.md).</p>
    <DSButton variant="primary" @click="clicks++">
      Clicked {{ clicks }} times
    </DSButton>
  </main>
</template>

<style scoped>
/* Tokens only — see app/assets/css/tokens.css (L0). */
.home {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--ds-space-8) var(--ds-space-4);
  display: grid;
  gap: var(--ds-space-4);
  justify-items: start;
}
</style>
