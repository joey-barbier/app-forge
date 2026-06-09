# CONVENTIONS — Vue 3 / Nuxt 4 / TypeScript

Prescriptive — follow as written. Layer placement is ARCHITECTURE.md; this file is how the
code inside each brick looks.

## 1. DS modules (L3 Core UI)

One folder per component family, fixed anatomy, one barrel:

```
app/designSystem/DSButton/
  components/DSButton.vue      # auto-registered globally (glob in nuxt.config)
  types/dsButton.ts            # variant consts + prop types — plain .ts, NEVER .d.ts
  composables/                 # optional: UI-only logic (focus trap, dismiss…)
  tests/DSButton.spec.ts       # vitest, mounts standalone — colocated with the module
  index.ts                     # barrel = the module's ONLY public surface
```

Rules:
- Name = `DS<Thing>` (folder, component, file). The prefix prevents collisions with feature
  components and makes DS usage grep-able.
- **Domain-blind**: props are primitives, UI enums, slots, callbacks. A domain model in a DS
  prop means the component belongs in `features/` (L4) — move it.
- Variants are a `const` array + derived union type (`DS_BUTTON_VARIANTS` →
  `DSButtonVariant`), exported from `types/`, so tests can iterate every variant.
- Cross-module imports go through the barrel: `import { DSButton } from '~/designSystem/DSButton'`.

> ⚠️ **Gotcha:** Symptom — `import { MY_CONST } from './types/foo'` is `undefined` at runtime.
> Cause — consts were authored in a `.d.ts` file; declaration files emit no JavaScript and most
> pipelines silently skip them. Fix — module types live in **plain `.ts`** files; reserve `.d.ts`
> for ambient declarations only (e.g. `window.yourProvider` — OPS_WEB.md §1).

## 2. Naming

| Thing | Convention | Example |
|---|---|---|
| DS component | `DS<Thing>.vue` | `DSButton.vue`, `DSModal.vue` |
| Feature component | `<Feature><Role>.vue` | `CheckoutSummary.vue` |
| Composable | `use<Thing>.ts`, one main export | `useApiErrorHandler.ts` |
| Domain module | noun, intent not tech | `order.ts`, `pricingEngine.ts` |
| Store | `use<Thing>Store` in `app/stores/` | `useSessionStore` |
| Types file | camelCase, plain `.ts` | `dsButton.ts` |
| Events emitted | past/imperative verb | `@save`, `@dismiss`, `@page-change` |
| Booleans | assertions | `isLoading`, `hasErrors`, `canSubmit` |

Comments explain **why** (decision, trap, side effect) — never what the code already says.

## 3. Component size cap — 200 target, 300 hard

A `.vue` file (template + script + style) over **300 lines is a review blocker**; over 200,
plan the split. Splitting recipe, in order:
1. **Pure logic out** → `app/domain/` (testable rules) or a module composable (UI orchestration).
2. **Repeated/markable template chunks out** → child components in the same module's
   `components/`, or a DS module if domain-blind.
3. **Types and consts out** → the module's `types/` file.

> 📖 **War story:** a production homepage hero grew to 1,353 lines — animation logic, three
> sub-layouts, inline SVG and tracking calls in one SFC. Every change risked every behavior, and
> no part was testable alone. The cap exists so the split happens at 250 lines, not at 1,353.

## 4. Data fetching — the SSR stance (read before any fetch)

This app runs `ssr: true`. **Default: fetch in setup** with `useAsyncData`/`useFetch` —
runs on the server, renders real content, hydrates without refetch:

```ts
const { data: projects, error, pending } = await useAsyncData(
  'projects',                                  // explicit, stable key
  () => useProjectsApi().list(),               // L2 repository composable — never raw $fetch
)
```

**Client-only fetching is the exception** and requires a written rationale at the call site:

```ts
// CLIENT-ONLY: depends on viewport size measured after mount; below the fold,
// not SEO-relevant, gated behind user interaction.
onMounted(async () => { … })
```

`grep -rn onMounted app/pages` with no adjacent `CLIENT-ONLY:` comment = violation.

> 📖 **War story:** a production app ran `ssr: true` while ~45 pages fetched everything in
> `onMounted`. The server rendered empty shells, crawlers indexed spinners, users got a content
> flash on every navigation — all of SSR's cost, none of its value. The stance above is the fix.

SSR safety rules:
- No `window`/`document` at setup top level — guard with `import.meta.client` or move to
  lifecycle hooks. `if (import.meta.server) return` is the idiom for client-only ops code.
- State shared between server render and client must use `useState`, not module-level `ref`s
  (module state leaks **between requests** on the server).
- Never patch globals (`window.fetch`, `console`) — see OPS_WEB.md §Logging.

## 5. Props / emits / boundaries

- `defineProps<{…}>()` + `withDefaults`, `defineEmits<{ save: [item: Item] }>()` — always typed.
- Bricks receive **values**, emit **events**. They never import a store, never navigate, never
  call the SDK. The page (L5) wires store ↔ brick and owns navigation.
- Optional callbacks/slots change the UI (e.g. no `@delete` listener → hide the delete button):
  use `defineSlots`/optional emits deliberately, document on the brick.

## 6. SDK consumption (L2)

- Wired ONCE in `app/plugins/sdk.ts` from `runtimeConfig` — components never instantiate it.
- All calls go through repository composables in `app/composables/api/`, which map wire DTOs to
  `domain/` models. Pages and stores call composables, never the SDK directly.
- **Import the SDK from its package root (or `…/types` subpath) only.** Deep `…/src/…` imports
  bypass the public contract and break on any internal refactor (ANTI_PATTERNS.md #3 — found in
  22 files of one consumer). Enforce with `no-restricted-imports` once ESLint lands.
- Every `catch` around an SDK call delegates to `useApiErrorHandler` (OPS_WEB.md §2).

## 7. Stores (L5)

- Pinia, only for state shared across pages (session, cart…). Module-local state lives in the
  module's composable instead.
- Stores are imported **explicitly from the `~/stores` barrel** — no directory auto-scan magic;
  the import graph must stay visible.
- Stores call L2 composables and `domain/` engines; they never touch components or routes.

## 8. Strings, styles, sizes

- **Every user-facing string goes through i18n** — including `aria-label`, `placeholder`,
  `title`. Hardcoded copy in a template is a violation (I18N.md has the detector script spec).
- **Visual values come from tokens**: `var(--ds-color-*)`, `var(--ds-space-*)`,
  `var(--ds-radius-*)`, `var(--ds-font-*)`. A hex color or magic px in a component is a bug;
  add a token instead.
- Scoped styles per component; global styles only in `app/assets/css/` base files.

## 9. Testing — real or absent

- **Unit (vitest)**: `domain/` engines (exhaustive, table-driven), DS components (mounted with
  `@vue/test-utils`, standalone — no Nuxt context), composables with logic. Colocated in each
  module's `tests/`. Must pass from a clean checkout: `npm install && npm run test`.
- **E2E (playwright)**: user journeys only, in `tests/e2e/`. `@playwright/test` is a real
  devDependency with a real config; specs boot the dev server themselves.
- A `package.json` script that cannot run from a clean checkout **is testing theater**
  (ANTI_PATTERNS.md #10): either install the dependency and keep the test green, or delete the
  script. Generated reports (`playwright-report/`, `coverage/`) are gitignored — a committed
  report is a claim, a green run is proof (DELIVERY.md).
- Every new domain rule ships with its test in the same change. No test, no rule.
