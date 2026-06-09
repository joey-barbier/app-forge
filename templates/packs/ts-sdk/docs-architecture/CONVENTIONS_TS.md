# CONVENTIONS — TypeScript for a typed SDK

House rules for every line of TypeScript in this repo. They instantiate SDK_CONTRACT.md
for this package — when in doubt, that file wins. Each rule below was paid for in
production; none is style preference.

## 1. Compiler discipline

- `strict: true`, no `any` (use `unknown` + narrowing). A cast (`as`) needs a comment
  explaining why narrowing is impossible.
- `verbatimModuleSyntax: true` — type-only imports are written `import type { … }`. This
  keeps the types-only subpath genuinely runtime-free.
- `npm run typecheck` (`tsc --noEmit`) is the fastest signal — run it before the test
  suite, run both before any build.

### `.ts` sources only — never author `.d.ts`

All of `src/` is plain `.ts`, **including every file in `src/types/`**. Declarations are
*generated* into `dist/` by the build, never written by hand.

> ⚠️ **Gotcha:** Symptom — consumers get "module has no exported member" for roughly half
> the public types while the source visibly contains them. Cause — types authored as
> `.d.ts` files: declaration generators treat them as already-compiled output and silently
> emit nothing, and a committed `dist/` masked the hole for months (a production team
> shipped 13 of 21 type modules missing this way). Fix — `.ts` sources only, `dist/`
> gitignored, and the `scripts/verify-dist.mjs` gate (run by `npm run build`) failing the
> build when a public name is absent from the emitted declarations.

## 2. Exports map — the public surface, and the types-only subpath

`package.json#exports` defines what exists. This SDK exposes exactly two entries:

- `"."` — the runtime surface (composition root, clients, errors, adapters).
- `"./types"` — **types only**, so a consumer's pure L3 layer can reference wire types
  without dragging the HTTP client into it (type imports erase at compile time).

Rules:
- Adding/removing/renaming a subpath is an architectural decision → `DECISIONS.md` entry
  + semver impact assessed. Deep paths (`/src/*`, `/dist/internal/*`) are never exposed.
- Everything public is re-exported from `src/index.ts` (or `src/types/index.ts`); a type
  reachable only through a deep import is a bug.
- `"sideEffects": false` stays true: no module-level statements with effects — module load
  must be free (no env reads, no global patching, no top-level `await`).

## 3. Dependencies policy — runtime deps target zero

- `"dependencies": {}` — the transport is built-in `fetch`; an SDK drags its runtime deps
  into every consumer's tree. Adding one requires a `DECISIONS.md` entry justifying it.
- Build/test tooling (`tsup`, `typescript`, `vitest`) lives in `devDependencies`, always.
- Release audit (it's in the checklist, §8): `npm pkg get dependencies` must print the
  expected object — ideally `{}`.

> ⚠️ **Gotcha:** Symptom — every consumer install pulls a bundler plugin (and its whole
> dependency tree) they never use. Cause — a declaration-generator plugin added under
> `dependencies` instead of `devDependencies`; nothing fails, so it ships for months.
> Fix — `dependencies` may contain only what `src/` actually imports at runtime; audit at
> every release (see SDK_CONTRACT.md §1).

## 4. Logging — injected port, silent by default

- **Zero `console.*` in `src/`** — grep-enforced (`grep -rn "console\." src/` must be
  empty); add `no-console: error` if you introduce a linter. Build scripts (`scripts/`)
  may print — they run on developer machines, not inside consumers.
- All logging goes through the `SDKLogger` port; the default is a no-op, and `debug()`
  only fires when the consumer passes `debug: true`. The *consumer* owns the switch.
- **Never log token values, `Authorization` headers, or token-presence booleans.** A
  production team once logged method + URL + which auth tokens were present on every
  request: unfilterable console noise for every consumer and a free map of the auth
  topology in devtools (SDK_CONTRACT.md §5). Log method + path, nothing from headers.

## 5. Errors — normalize once, never re-parse

- Every non-2xx response becomes an `ApiError` via `ApiError.fromResponse(status, text)` —
  thrown by the transport, the single place that reads response bodies on failure.
- The wire error shape `{ code, name, description }` is frozen contract: renaming a field
  is a **breaking change in two repos** (SDK_CONTRACT.md §2) — major bump + MIGRATION entry.
- Clients (`src/clients/`) never catch-and-rewrap, never inspect bodies; consumers map
  `statusCode` → UX in one shared handler, never re-parse raw responses.
- Genuine network failures (DNS, refused connection) propagate as-is — inventing a fake
  status code for them would lie to the consumer's error handler.

## 6. Auth invariants — single-flight or nothing

The contract is SDK_CONTRACT.md §3; the local law:

- One shared inflight refresh promise; latecomers await it; the wait is **bounded** by a
  timeout that rejects (never hang waiters forever).
- On 401: join/start the refresh, then retry the original request **exactly once**. Two
  retries hide real auth breakage; zero retries logs users out on every token expiry.
- On refresh failure or timeout: **clear all tokens and fail every waiter** — a
  half-authenticated session is worse than a logout.
- The refresh call uses the raw transport, never the secure `request()` path (a 401 from
  the refresh endpoint must not recurse).
- `tests/singleFlight.test.ts` pins all of this against a fake API with *single-use*
  rotating refresh tokens. It is the regression test for a real production bug
  (N parallel 401s → N refreshes → N−1 failures → random logouts) and is non-negotiable.

> ⚠️ **Gotcha:** Symptom — intermittent logouts return months after the fix. Cause —
> someone "simplified" the auth use case and dropped the shared inflight promise; the bug
> is invisible in manual testing because it needs concurrent expiry. Fix — the concurrency
> test stays, and any `AuthClient` refactor runs it first.

## 7. Testing conventions

- **vitest**, plain `node` environment. `npx vitest run` (CI mode) is the gate; watch mode
  is for development only.
- **Stub the `HttpTransport` port** in client/use-case tests — never patch global `fetch`
  there (only a transport adapter test may). Fakes enforce realistic API behavior (e.g.
  single-use refresh tokens), not just canned responses.
- Concurrency tests use `Promise.all` / `Promise.allSettled` over real async boundaries —
  no fake timers for the single-flight suite (timing is the point; keep timeouts short).
- Every test asserts observable behavior (calls, payloads, thrown `ApiError` fields).
  A test without a meaningful assertion is deleted, not kept for coverage.
- Tests import from `../src/index` wherever possible — they double as proof that the
  public surface actually exports what consumers need.

## 8. Releases & versioning

- **Semver, tagged.** While `0.x`: breaking ⇒ **minor** bump; from `1.0.0`: breaking ⇒
  **major**. (This convention is stated here so clients can rely on it — changing it is a
  DECISIONS.md entry.)
- **Never commit `dist/`** — built at tag time. Consumers pin tags or registry versions,
  never a branch (MULTI_REPO_CONTRACT.md — branch pins broke a production deploy with an
  empty diff).
- Every breaking change ships a dated **MIGRATION.md** section in the same change: what
  changed (before/after code), why, impact, and security implications when auth/cookies
  are involved. Every sample in it must compile against the real surface
  (SDK_CONTRACT.md §7 — invented samples convert knowledge gaps into false confidence).

Release checklist (all outputs shown, per DELIVERY.md proof discipline):

```bash
npm run typecheck && npx vitest run     # green
npm run build                           # tsup + verify-dist gate green
npm pkg get dependencies                # expected (ideally {})
npm pack --dry-run                      # tarball = dist + manifest, nothing else
# CHANGELOG entry (+ MIGRATION entry if breaking) → bump version → git tag vX.Y.Z
```

## 9. Naming & style

- One exported class per file, file named after it: `AuthClient.ts`, `ProjectClient.ts`.
  Resource clients end in `Client`; ports are interfaces named for the capability
  (`HttpTransport`, `SDKContext`, `SDKLogger`).
- Names express intent, not technology (`ProjectClient.list()`, not `getProjectsHTTP`).
- String-literal unions over `enum` (erasable, tree-shakeable, JSON-friendly).
- `async/await` over `.then()` chains; no default exports; no module-level mutable state
  outside class instances (the inflight refresh promise lives on the client instance).
