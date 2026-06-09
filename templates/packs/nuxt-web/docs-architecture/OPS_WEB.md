# OPS_WEB — analytics, errors, logging, flags, deploy

The L1 ops layer plus the ship pipeline. Everything here is product-blind plumbing; if a
snippet needs a domain type, it's in the wrong file.

## 1. Analytics as code — the typed event catalog

Event names scattered as inline strings make the tracking plan unauditable and typo-prone.
The catalog **is** the tracking plan:

```ts
// app/constants/analytics.ts (L1)
export const ANALYTICS_EVENTS = {
  // Naming: [Context] [Action] [Element] — document expected props inline
  SCROLL_DEPTH:     'Scroll Depth',        // props: { percent: 25|50|75|100, page }
  CTA_HERO_PRIMARY: 'CTA Hero Primary',    // props: { page }
  SIGNUP_COMPLETED: 'Signup Completed',
} as const

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS]

export function trackEvent(
  name: AnalyticsEvent,
  props?: Record<string, string | number | boolean>,
): void {
  if (import.meta.server) return                       // SSR-safe by construction
  window.yourProvider?.(name, props ? { props } : undefined)
}
```

Rules:
- **If an event name isn't in the catalog, the event doesn't exist.** A provider call with an
  inline string anywhere else is a violation — grep for the provider symbol outside this file.
- Props are documented next to each event; changing an event's name or props is reviewed like
  an API change (dashboards are consumers).
- Renamed events keep the old entry in a `// LEGACY` section until dashboards migrate, then die.
- Behavioral tracking (scroll depth, section visibility) lives in dedicated composables that
  import the catalog — components call `useScrollDepthTracking('pricing')`, never the provider.
- Use a privacy-respecting, cookieless provider when possible; anything cookie-based goes
  behind the consent manager.

## 2. API errors — one handler, statusCode → severity

UI code never inspects response bodies or invents error copy. The SDK normalizes every non-2xx
into a typed `ApiError` (SDK_CONTRACT.md §2); the app maps it to UX exactly once:

```ts
// app/composables/useApiErrorHandler.ts
const SEVERITY: Record<number, 'warning' | 'error'> = {
  409: 'warning',   // conflict: "already exists" — recoverable, don't alarm
  423: 'warning',   // locked / temporarily unavailable
}

export function useApiErrorHandler() {
  const { t, te } = useI18n()
  const toast = useToast()

  function handleError(error: unknown, overrides?: Record<number, string>): void {
    if (isApiError(error)) {                        // type guard exported by the SDK
      const key = `errors.api.${error.errorName}`   // wire contract → i18n/errors.json
      const message = overrides?.[error.statusCode] ?? (te(key) ? t(key) : t('errors.generic'))
      toast[SEVERITY[error.statusCode] ?? 'error'](message)
      return
    }
    toast.error(t('errors.generic'))                // never leak raw Error.message to users
  }
  return { handleError }
}
```

Usage — per-call overrides for context-specific copy:

```ts
try { await useTeamsApi().create(input) }
catch (e) { handleError(e, { 409: t('teams.alreadyExists') }) }
```

Rules: every `catch` around an L2 call delegates here · 401 is NOT handled here (the SDK's
session layer owns refresh/logout — SDK_CONTRACT.md §3) · raw `error.message` never reaches
a toast (it's developer text, often English-only, sometimes sensitive).

## 3. Logging — injected, never monkey-patched

One logger module in `app/utils/logger.ts` (level from runtime config, structured meta), exposed
to app code via plugins (`logger.client.ts`, `logger.server.ts`). Production builds drop stray
`console.*` (esbuild `drop`), so the logger is the only voice that survives.

> ⚠️ **Gotcha:** Symptom — every HTTP request in the app gets logged twice, aborts and streamed
> responses behave oddly, and nobody can find *where* the logging comes from. Cause — a plugin
> reassigned `window.fetch` to a logging wrapper. Patched globals are invisible at call sites,
> stack with every other patcher, double-instrument SDK traffic that already has its own logging
> port, and subtly break fetch semantics. Fix — instrument the boundaries you own: the SDK's
> injected logger (SDK_CONTRACT.md §5) and, for app-local calls, a created client —
> `$fetch.create({ onRequest, onResponse, onResponseError })` — that callers import knowingly.

## 4. Feature flags — fail closed

```ts
// app/utils/flags.ts (L0 pure) — read via useRuntimeConfig in a composable (L1)
const TRUTHY = new Set(['true', '1'])
export function flagEnabled(value: string | boolean | undefined | null): boolean {
  if (typeof value === 'boolean') return value
  if (value == null) return false                       // missing means OFF
  return TRUTHY.has(String(value).trim().toLowerCase()) // unknown means OFF
}
```

Misconfiguration must disable the feature, never enable it. Parsers like `value !== 'false'`
turn every typo into a silent activation (ANTI_PATTERNS.md #8 — found in production). When a
flag evaluates to off because the value was unrecognized, log a warning naming the variable.

## 5. Runtime config — one shape, runtime overrides

- Declare every key in `runtimeConfig` (server) / `runtimeConfig.public` (client-visible) with
  a safe default. Override at **runtime** via `NUXT_<KEY>` / `NUXT_PUBLIC_<KEY>` env vars.
- Secrets live server-side only. A secret in `public` ships to every browser.
- Because public values are runtime-overridable, **one image serves all environments** — don't
  bake per-environment URLs at build time (see §6).

## 6. Docker — multi-stage, BuildKit secrets, tiny runtime

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# Private registry/git auth: BuildKit secret — NEVER a build ARG.
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
COPY . .
RUN npm run build                                  # → .output/ (self-contained Nitro server)

FROM node:22-alpine AS production
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.output ./.output
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", ".output/server/index.mjs"]
```

Build: `docker build --secret id=npmrc,src=$HOME/.npmrc -t app .`
Ship a `.dockerignore` (node_modules, .nuxt, .output, .env*, test artifacts) or the builder
context uploads your laptop.

> ⚠️ **Gotcha:** Symptom — a repo access token readable by anyone who can pull the image.
> Cause — the token entered the build as an `ARG` and was written into git config in a `RUN`
> layer; `docker history` and layer caches preserve both. Fix — BuildKit secret mounts: the
> secret exists only during the single `RUN` it's mounted into and never lands in a layer.

> ⚠️ **Gotcha:** Symptom — every new config variable must be edited in four places (workflow
> secrets, Dockerfile ARGs, Dockerfile ENVs, compose file) and someone always misses one.
> Cause — public config baked at build time forces the whole env through build args. Fix — §5:
> runtime `NUXT_*` overrides; build args only for values that genuinely change the build output.

## 7. Health & deploy gate — one endpoint, every consumer

```ts
// server/api/health.get.ts — already in the skeleton
export default defineEventHandler(() => ({ status: 'ok', service: '…', time: … }))
```

- **Exactly one health endpoint.** The Docker HEALTHCHECK, the orchestrator/reverse-proxy
  check, the deploy gate and uptime monitoring all hit `/api/health`. Two "health" URLs WILL
  diverge, and the one your alerting watches will be the stale one.
- The deploy pipeline's last step curls it on the live host and fails the deploy on non-200 —
  proof over claims (DELIVERY.md), applied to infrastructure.
- Keep it dependency-free (no DB call) unless a dependency genuinely gates "alive"; if you add
  readiness checks later, extend the same endpoint's payload, don't add a second URL.

## 8. Error monitoring

Add a crash/error reporter (client + server) before the first real user, not after the first
real incident. Requirements: source maps uploaded at build (hidden from the public bundle),
environment tag from runtime config, and the `useApiErrorHandler` path reports unexpected
(5xx/unknown) errors — expected 4xx noise stays out of the alert channel.
