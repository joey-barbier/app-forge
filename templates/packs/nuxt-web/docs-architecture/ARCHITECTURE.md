# ARCHITECTURE — Layered Nuxt Web App

Maps the universal L0–L5 contract (`ARCHITECTURE_PRINCIPLES.md` — read it first) onto
Nuxt 4 / Vue 3 / TypeScript. One repo, one `app/` source dir. Nuxt has no module-system
walls, so **the import graph IS the architecture** — every rule below must stay
grep-visible (Physical mapping rule 2).

## 1. Layer model — Nuxt instantiation

```
L5  COMPLETE FEATURES   app/pages/        file-based routes — THIN assemblies only
                        app/layouts/      shells (default, app, …)
                        app/stores/       shared app state (Pinia) — explicit barrel imports
                        app/middleware/   route policy (auth from route meta — SEO_AND_ROUTING.md)
                        app/plugins/sdk.ts  composition root: wires the SDK with runtime config
                        app.vue · error.vue · server/ (health endpoint, BFF routes)
L4  SHARED FEATURES     app/features/<Feature>/   domain-AWARE bricks reused by ≥2 pages
                        (components/ + composables/ + types/ + index.ts barrel)
L3  CORE LOGIC          app/domain/       pure TS: models, engines, validation —
                                          no Vue, no Nuxt, no IO, no auto-imports
    CORE UI             app/designSystem/<DSModule>/   domain-BLIND components
                        (components/ + types/ + composables/ + index.ts barrel)
L2  DATA                the typed SDK (external package — SDK_CONTRACT.md)
                        app/composables/api/   repository composables: call SDK,
                                               map wire types → domain models
L1  OPS                 app/plugins/  analytics.client.ts · logger.{client,server}.ts · flags
                        app/constants/analytics.ts   the typed event catalog (OPS_WEB.md)
L0  FOUNDATION          app/assets/css/tokens.css   design tokens (CSS custom properties)
                        app/utils/    pure helpers/formatters — no Vue imports
```

## 2. Dependency direction rules

| Layer | May use | Must NEVER use | Why |
|---|---|---|---|
| L0 tokens + utils | nothing | Vue, Nuxt, the DOM | testable in node, reusable anywhere |
| L1 ops | L0, runtime config | domain types, SDK | plumbing is product-blind |
| L2 api composables | SDK public surface, L3 domain models, L1, L0 | components, stores | they implement L3 needs (the sanctioned upward arrow: models/contracts only) |
| L3 `domain/` | L0 utils only | Vue, Nuxt, SDK, fetch | pure — vitest runs it in milliseconds |
| L3 `designSystem/` | L0 tokens, Vue | domain types, SDK, stores, i18n keys of features | a DS button doesn't know what an "Order" is |
| L4 `features/` | L3, L2, L1, L0 | sibling features, pages, stores in props | bricks take values + emit events |
| L5 pages/layouts/stores | everything below | sibling pages | final assembly, throwaway by design |

- **L4/L5 communicate by props down / events up** (`@save`, `@delete`) — a brick never reaches
  into a store on its own; the page wires store ↔ brick.
- **Auto-imports hide the import graph.** A composable used without an import line is still a
  dependency. Compensate with placement + naming discipline (CONVENTIONS.md) and the greps in §5.

> ⚠️ **Gotcha:** Symptom — refactoring the API SDK breaks the *design system*. Cause — a
> production team kept domain row components (`ProjectRow`, `ReleaseRow`…) inside the DS folder,
> their props typed against deep SDK internals (`sdk/src/types/*`). Fix — `designSystem/` is
> domain-blind by contract: primitives and UI types in props only. Domain-aware composites are
> **features (L4)**; SDK types enter through L2 mapping, never through component props' imports.

> ⚠️ **Gotcha:** Symptom — a "component" added under `app/pages/` becomes a navigable route.
> Cause — Nuxt routes every `.vue` file under `pages/`. Fix — components never live in `pages/`;
> page-specific pieces go to the matching `features/<Feature>/components/`.

## 3. Module anatomy + registration

DS modules (L3) and feature modules (L4) share one anatomy:

```
app/designSystem/DSButton/          app/features/Checkout/
  components/DSButton.vue             components/CheckoutSummary.vue
  types/dsButton.ts                   composables/useCheckout.ts
  index.ts          ← barrel          types/checkout.ts
                                      index.ts
```

`nuxt.config.ts` registers them once, by glob — adding a module requires zero config:

```ts
components: [
  { path: '~/designSystem/**/components', pathPrefix: false },
  { path: '~/features/**/components',     pathPrefix: false },
],
imports: { dirs: ['~/designSystem/**/composables', '~/features/**/composables'] },
```

- Components auto-register by file name (`<DSButton />` in any template).
- **Everything else crosses module boundaries through the barrel**:
  `import { DS_BUTTON_VARIANTS } from '~/designSystem/DSButton'` — never a deep file path.
  The barrel is the module's public surface; internals are refactorable.

## 4. Layer contracts

### L3 `domain/` — the pure heart
Plain TS modules: entities, engines (pure functions, injected `now`/randomness), validation,
repository *contracts* (interfaces) when the app owns orchestration. Zero imports from Vue/Nuxt.
This is where DELIVERY.md's "domain heart" slice lives; every rule ships with a vitest test that
runs without booting Nuxt.

### L2 — the SDK and its composables
The SDK is wired ONCE in `app/plugins/sdk.ts` (runtime config → client instance → `provide`).
Repository composables (`app/composables/api/useProjectsApi.ts`) are the only callers; they map
wire DTOs to `domain/` models. **No component or store calls `$fetch` to the backend directly**
(MULTI_REPO_CONTRACT.md: never bypass the SDK).

### L1 — ops plugins
Analytics catalog + `trackEvent`, logger plugins (client/server variants), feature-flag reader
(fail closed). All specified in OPS_WEB.md. Nothing here knows the domain.

### L5 — pages, layouts, stores, middleware
Pages assemble bricks, declare their own route policy (`definePageMeta({ auth: false })`), own
SEO meta, and fetch via `useAsyncData` in setup (CONVENTIONS.md §4). Stores hold cross-page
state only; module-local state belongs in the module's composable.

## 5. Enforcement greps — run before claiming a slice done

```bash
grep -rn "from '~/designSystem" app/domain app/utils            # L3-pure importing UI → bug
grep -rn "sdk/src\|/dist/" app --include='*.ts' --include='*.vue'  # deep SDK imports → bug
grep -rnE "#[0-9a-fA-F]{3,8}\b" app --include='*.vue'           # hex color outside tokens → bug
grep -rn "\$fetch(" app/pages app/features app/stores            # raw API calls bypassing L2
grep -rn "onMounted" app/pages                                   # each hit needs a CLIENT-ONLY rationale
awk 'END{ if (NR>300) exit 1 }' <component>.vue                  # size cap (CONVENTIONS.md §3)
```

## 6. Where does a new file go?

| You are adding… | It lives in… |
|---|---|
| A color/spacing/font/radius value | `app/assets/css/tokens.css` (L0) |
| A pure formatter/helper | `app/utils/` (L0) |
| An analytics event, logger, feature flag | `app/constants/` + `app/plugins/` (L1) |
| An API call / DTO mapping | `app/composables/api/` (L2) |
| A business rule, entity, engine | `app/domain/` (L3) — with its test |
| A domain-blind component (button, card, modal) | `app/designSystem/<DSModule>/` (L3) |
| A domain-aware brick used by ≥2 pages | `app/features/<Feature>/` (L4) |
| A route, layout, cross-page state, route policy | `app/pages/`, `app/layouts/`, `app/stores/`, `app/middleware/` (L5) |
| A server-only endpoint (health, BFF) | `server/api/` (L5) |
| A user-facing string | `i18n/<locale>/<feature>.json` (I18N.md) |

When in doubt between L4 and L5: start in the page, promote to `features/` on second use.

## 7. Why this works with AI agents

- **Fast ground truth without the browser**: `npm run test` exercises `domain/`, `utils/`,
  DS components and composables in seconds — agents iterate there before paying for
  `nuxt build` or a browser session.
- **Grep-visible violations** (§5): every architectural rule is one search away.
- **Deterministic components**: DS modules mount standalone in vitest (no Nuxt context),
  so UI bricks are provable without e2e.
- **Predictable placement** (§6): an agent knows the 3–5 files a feature needs; diffs stay small.

Build matrix before claiming "done":
```bash
npm run test          # unit layer — seconds
npm run build         # full SSR build
npm run dev           # then eyes-on: open the page, check empty/error states
```
