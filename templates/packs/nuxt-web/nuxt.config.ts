// Layer mapping and the reasoning behind every block: docs-architecture/ARCHITECTURE.md
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  // SSR is ON and stays on. Public pages must render their content server-side;
  // data fetching happens in setup (useAsyncData), never in onMounted without a
  // written CLIENT-ONLY rationale. See docs-architecture/SEO_AND_ROUTING.md §1.
  ssr: true,

  devtools: { enabled: true },

  css: [
    '~/assets/css/tokens.css', // L0 — the ONLY place visual values are defined
    '~/assets/css/main.css',
  ],

  // Module auto-registration: DS modules (L3, domain-blind) and feature modules (L4)
  // expose their components/ subfolder. Adding a module requires zero config here.
  components: [
    // NOTE: glob goes in `pattern`, not `path` — a glob inside `path` is silently
    // ignored by the scanner (zero components registered, no warning).
    { path: '~/designSystem', pattern: '**/components/**', pathPrefix: false },
    { path: '~/features', pattern: '**/components/**', pathPrefix: false },
  ],

  imports: {
    dirs: [
      '~/designSystem/**/composables',
      '~/features/**/composables',
    ],
  },

  runtimeConfig: {
    // Server-only values (override at runtime: NUXT_<KEY>). Secrets live HERE.
    public: {
      // Client-visible values (override at runtime: NUXT_PUBLIC_<KEY>) — never secrets.
      apiBaseUrl: '',
      baseUrl: 'http://localhost:3000',
      environment: 'development',
    },
  },

  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: '{{PROJECT_NAME}}',
    },
  },
})
