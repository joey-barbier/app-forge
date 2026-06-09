# SEO & ROUTING — mixed public/private apps on SSR

The default product shape this pack assumes: public marketing pages (home, pricing, features,
changelog…) and a private app behind auth — in ONE Nuxt codebase. This file is the recipe
that keeps both worlds correct.

## 1. SSR is on and stays on

`ssr: true` is the pack default. Public pages must deliver their content **in the server
response** — crawlers and link previews don't run your client fetches reliably, and users
shouldn't watch spinners for static copy.

Proof command (run it on every public page before calling it done):

```bash
curl -s http://localhost:3000/pricing | grep -i "your headline text"
```

If the content isn't in the HTML, the page is fetching client-side — fix the data fetching
(CONVENTIONS.md §4: `useAsyncData` in setup, `onMounted` only with a `CLIENT-ONLY:` rationale).

## 2. Auth policy lives ON the route — default deny

Public pages declare their own policy, next to their own code:

```ts
// app/pages/pricing.vue
definePageMeta({ auth: false })
```

The global middleware reads route meta and **default-denies** everything else:

```ts
// app/middleware/auth.global.ts — add the day auth lands; the meta convention starts day one
export default defineNuxtRouteMiddleware((to) => {
  if (to.meta.auth === false) return                    // page opted out, explicitly
  const { isAuthenticated } = useSession()              // your auth provider's session check
  if (!isAuthenticated.value) {
    return navigateTo({ path: '/', query: { redirect: to.fullPath } })
  }
})
```

Absolute rules:
- **Never a name allowlist** (`['index', 'pricing', …]`) — it's a second route table that
  silently drifts from the real one (ANTI_PATTERNS.md #2).
- New pages are **private by default**; making one public is a one-line, reviewable, greppable
  diff on the page itself: `grep -rn "auth: false" app/pages` lists the public surface.
- The redirect target preserves `redirect=` so login returns the user where they were headed.

> 📖 **War story:** a production team used a hand-maintained array of public page names in the
> auth middleware. A public changelog page shipped but was never added to the list — anonymous
> visitors (and crawlers) were silently 302'd to the homepage **for weeks**. No error, no log,
> no failing test; the sitemap even advertised the URL. Route-meta + default-deny makes that
> failure impossible: the page carries its own policy, and forgetting it fails *closed* (a
> private page stays private) instead of breaking the public site invisibly.

## 3. Sitemap & robots — explicit allowlist, never the route table

- The sitemap lists **only an explicit array of public URLs**, maintained next to the sitemap
  config. Never auto-generate from the route table — your route table contains the private app.
  With `@nuxtjs/sitemap`: `excludeAppSources: true` + an explicit `urls` list.
- Adding a public page = page file + `auth: false` + sitemap entry + i18n module. Put this
  4-item checklist in the PR template.
- Private sections also send `X-Robots-Tag` via route rules (belt and braces with the auth wall):

```ts
routeRules: {
  '/':            { prerender: true },                       // pure-static marketing
  '/pricing':     { prerender: true },
  '/changelog':   { swr: 3600 },                             // public but updated often
  '/app/**':      { headers: { 'X-Robots-Tag': 'noindex' } } // private app surface
},
```

- **Staging must never be indexed**: gate a global `robots: noindex, nofollow` meta on the
  environment from runtime config — not on `NODE_ENV`, which is `production` on staging builds.

## 4. Per-page meta

Every public page owns its meta in setup — no global defaults pretending to be content:

```ts
useSeoMeta({
  title: t('pricing.meta.title'),
  description: t('pricing.meta.description'),
  ogTitle: t('pricing.meta.title'),
  ogImage: `${config.public.baseUrl}/og/pricing.png`,   // ABSOLUTE URL — relative og:image is ignored
  twitterCard: 'summary_large_image',
})
```

- `og:image` and canonical URLs must be **absolute**, built from `runtimeConfig.public.baseUrl`
  — never hardcoded hostnames (they rot across environments).
- One `<h1>` per page; headings follow document order — crawlers and screen readers share it.
- Dynamic public pages (blog posts…) set meta from the same `useAsyncData` payload that renders
  the content, so meta and body can't diverge.

## 5. Routing hygiene

- File-based routes only; no `hashMode`. Deep links into the private app must survive the
  login round-trip (the `redirect=` query above).
- Route params are validated in the page (`validate`) — a malformed id is a 404, not a blank
  page with a console error.
- Error states route through `error.vue` with correct status codes:
  `throw createError({ statusCode: 404, statusMessage: 'Not found' })` during SSR returns a
  real 404 to crawlers — a soft-404 (200 + "not found" text) poisons indexing.
- i18n URL strategy: app-only products may hide locale (`no_prefix`); indexable multilingual
  marketing needs per-locale URLs + `hreflang` (I18N.md §5). Record the choice in DECISIONS.md.

## 6. Pre-ship checklist (public pages)

- [ ] `definePageMeta({ auth: false })` present
- [ ] Content visible in `curl` output (SSR-rendered, no client fetch for primary content)
- [ ] `useSeoMeta` with title/description/absolute ogImage
- [ ] Sitemap entry added; staging still noindex
- [ ] i18n module exists in every locale (parity check green)
- [ ] Status codes correct for the page's error paths (404 via `createError`, not a soft-404)
