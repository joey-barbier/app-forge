# {{PROJECT_NAME}} — Claude Code Operating Manual

This project was scaffolded by **AppForge** (pack: Web/Nuxt): a Claude-Code-first
architecture extracted from production apps. You (Claude) are the team lead AND the
primary developer. Follow this manual exactly — it encodes hard-won lessons, not preferences.

## Identity
- App: **{{PROJECT_NAME}}** · Identifier: `{{BUNDLE_ID}}` · Nuxt 4 / Vue 3 / TypeScript · **SSR ON**
- Backend: consumed through a typed SDK (the app's L2) when the product has an API — see `SDK_CONTRACT.md`.

## Session protocol (MANDATORY)
1. **Session start**: run the `restore-context` skill — read `.claude/memory/*.md` before doing anything. Never invent project facts.
2. **Empty project / new idea**: run the `kickoff` skill — it interviews the user, writes the PRD, plans slices, then builds autonomously.
3. **After significant work**: update `.claude/memory/PROJECT_STATE.md` (and DECISIONS/NEXT_STEPS when relevant) — `save-context` skill.

## Architecture (read the docs before coding)
The knowledge base lives in `docs-architecture/`. Read the relevant doc BEFORE touching that area:

| You are about to… | Read first |
|---|---|
| understand the layer model (stack-agnostic) | `ARCHITECTURE_PRINCIPLES.md` |
| plan/deliver slices, validate, update memory | `DELIVERY.md` |
| product spans repos (API + SDK + clients) | `MULTI_REPO_CONTRACT.md` |
| consume or ship the typed SDK | `SDK_CONTRACT.md` |
| accept user-supplied URLs (webhooks…) | `SECURITY_USER_URLS.md` |
| write any documentation | `DOCS_PLACEMENT.md` |
| add caching/feature flags/auth shortcuts | `ANTI_PATTERNS.md` |
| add/move any file, create a feature | `ARCHITECTURE.md` |
| write any Vue/TS code, fetch data, size a component | `CONVENTIONS.md` |
| add or change any user-facing string | `I18N.md` |
| add a page, auth policy, meta tags, sitemap | `SEO_AND_ROUTING.md` |
| analytics, error handling, logging, flags, deploy | `OPS_WEB.md` |

Layer summary (universal contract in ARCHITECTURE_PRINCIPLES.md, Nuxt mapping in ARCHITECTURE.md):
L0 `app/assets/css/tokens.css` + `app/utils/` · L1 `app/plugins/` (analytics/logger/flags) +
`app/constants/` · L2 typed SDK + `app/composables/api/` · L3 `app/domain/` (pure TS — **never
imports Vue or Nuxt**) + `app/designSystem/` (domain-blind DS modules) · L4 `app/features/` ·
L5 `app/pages/` + `app/layouts/` + `app/stores/` + `app/middleware/`. Imports point downward only.

> **What ships vs. what you add at kickoff.** The skeleton ships only the always-needed L0/L3/L5
> floor: `app/assets/css/`, `app/utils/`, `app/domain/`, `app/designSystem/DSButton`, `app/features/`,
> `app/pages/index.vue`, `app/app.vue`, `server/api/health.get.ts`. The rest of the map above —
> `app/plugins/`, `app/constants/`, `app/composables/api/`, `app/stores/` (Pinia), `app/middleware/`,
> `app/layouts/`, `error.vue` — is the **target shape**: create each directory (and add its dep, e.g.
> `@pinia/nuxt` for stores) the slice it first earns a real file. Don't pre-create empty folders; the
> map tells you where a thing goes when it lands, not what exists today.

## Non-negotiable rules
- **Unit tests first**: `npm run test` (vitest, seconds) before any `nuxt build`. Every test script
  must run from a clean checkout — a script whose dependency isn't installed is testing theater.
- **Never claim done without proof**: vitest green + `npm run build` green + (for UI) the rendered
  page actually inspected — browser screenshot, or `curl` the SSR output and grep for the content.
- **Data fetching**: `useAsyncData`/`useFetch` in setup by default (SSR renders real content).
  Client-only fetching requires a written `// CLIENT-ONLY:` rationale at the call site.
- **Design tokens only**: no hex colors, no magic px in components — everything via `var(--ds-*)`.
- **Auth from route meta**: public pages declare `definePageMeta({ auth: false })`; the global
  middleware default-denies. Never a name allowlist (SEO_AND_ROUTING.md has the scar).
- **Component size cap**: 200 lines target, 300 hard — split per CONVENTIONS.md §3.
- **Analytics through the typed catalog only**; **feature flags fail closed**;
  **SDK imports from the package root only** (never `…/src/…`).
- **Memory is law**: contradictions between memory files and code → code wins, then fix the memory file.

## Build commands
```bash
npm run test     # vitest unit suite — seconds, ALWAYS first
npm run build    # nuxt production build
npm run dev      # eyes-on proof at http://localhost:3000
```
E2E: `npx playwright install` once per machine, then `npm run test:e2e`
(boots its own dev server — see playwright.config.ts).

## Git
- Never push without explicit user approval. Feature branches; commit format `add/update/fix(scope) - description`.
- No AI attribution in commits or file headers.
