# SDK Contract — shipping a typed SDK between your API and your clients

When several frontends (web, SSR, CLI, CI) consume one API, the API client becomes its own
package: a typed SDK. This file is the contract for building and distributing it. It assumes
the layer model from ARCHITECTURE_PRINCIPLES.md and the proof discipline from DELIVERY.md.

**Where the SDK sits**: inside the consumer app, the SDK is an **L2 Data brick** — it is the
network client behind the repository implementations. L3 Core Logic declares repository
contracts; L2 implements them by calling the SDK and mapping wire types → domain models.
No L3+ brick ever instantiates the SDK directly; only the composition root (L5) wires it.

## 1. Package layout

```
sdk/
  src/
    types/        # wire types, enums, type guards — imports NOTHING else in the package
    errors/       # ApiError + normalization (fromResponse)
    core/         # http transport, session manager, token service, secure-request use case
    ports/        # storage port (SDKContext) + adapters: browser, SSR
    clients/      # one client per resource (ProjectClient, UserClient…) — thin, typed methods
    index.ts      # composition root: wires transport → auth → clients; re-exports types/errors
  tests/          # transport, token, concurrency tests (see §3)
  MIGRATION.md    # one section per breaking change (see §7)
  CHANGELOG.md
```

Internally the SDK obeys the same lattice in miniature: `types` ≈ L0, `errors` ≈ L0,
`core`/`clients` ≈ L2, `index.ts` ≈ L5. `types/` importing from `clients/` is a bug.

**Exports map — a types-only subpath is mandatory** so consumer L3 code can reference wire
types without dragging the HTTP client into the pure layer (type imports erase at compile
time; runtime client imports stay in L2/L5):

```jsonc
{
  "name": "@{{PROJECT_NAME}}/sdk",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".":        { "types": "./dist/index.d.ts", "import": "./dist/index.js", "require": "./dist/index.cjs" },
    "./types":  { "types": "./dist/types/index.d.ts", "import": "./dist/types/index.js" }
  },
  "dependencies": {},                  // target: zero — fetch-based transport
  "devDependencies": { "typescript": "…", "vite": "…", "vite-plugin-dts": "…" }
}
```

> ⚠️ **Gotcha:** build tooling in `dependencies`. Symptom: every consumer `npm install`
> pulls the SDK's bundler plugin into their tree. Cause: `vite-plugin-dts` (or similar)
> added under `dependencies` instead of `devDependencies`. Fix: an SDK's `dependencies`
> must contain only what its *runtime* imports — audit it at every release; ideally empty.

## 2. Error normalization — the contract crosses repos

Errors are part of the API contract, and the contract spans two repositories. Freeze the
wire shape, normalize once in the SDK, map to UX once in the consumer.

**SDK side** — every non-2xx response becomes one typed error, never a raw fetch error:

```ts
class ApiError extends Error {
  readonly code: number; readonly errorName: string;
  readonly statusCode: number; readonly rawMessage?: string;
  static fromResponse(statusCode: number, responseText: string): ApiError {
    // 1. try JSON.parse → expect { code, name, description } (the wire contract)
    // 2. shape mismatch or parse failure → standard error built from statusCode
  }
}
```

**Consumer side** — one shared handler maps `statusCode` → severity + i18n message, with
per-call overrides. UI code catches and delegates; it never inspects response bodies:

```ts
const { handleError } = useApiErrorHandler()
try { await repo.createTeam(input) }
catch (e) { handleError(e, { 409: t('team.alreadyExists') }) }   // 409 → warning, rest → error
```

Rules: renaming a wire error field is a **major** version bump in both repos. The SDK never
swallows status codes; the consumer never re-parses raw responses.

## 3. Auth tokens — single-flight refresh, injected storage

### Single-flight refresh

With rotating, **single-use** refresh tokens, two concurrent 401s must produce exactly one
refresh call. Keep one inflight promise; latecomers await it; always bound the wait:

```ts
private refreshing: Promise<void> | null = null;

// on 401 inside the secure-request use case:
if (!this.refreshing) {
  this.refreshing = this.doRefresh().finally(() => { this.refreshing = null; });
}
await withTimeout(this.refreshing, REFRESH_TIMEOUT_MS);  // reject, don't hang forever
return retryOriginalRequest();                            // retry ONCE with the new token
```

On refresh failure: clear tokens, fail all waiters — a half-authenticated session is worse
than a logout.

> 📖 **War story:** a production team shipped refresh-on-401 without synchronization. Any
> page firing parallel requests after token expiry sent N simultaneous refreshes; the
> rotating refresh token was single-use, so N−1 calls failed and randomly logged users out.
> Fix: the shared inflight promise above — plus the regression test below, because this bug
> reappears every time someone "simplifies" the use case.

**The concurrency regression test is non-negotiable** (DELIVERY.md: every rule ships with
its test):

```ts
test('concurrent 401s trigger exactly ONE refresh', async () => {
  // arrange: two requests that 401 first, succeed after refresh
  await Promise.all([sdk.projects.list(), sdk.users.me()]);
  expect(tokenService.refresh).toHaveBeenCalledTimes(1);
});
// also test: refresh timeout rejects waiters; refresh failure clears tokens
```

### Storage is an injected port

The SDK never touches `document.cookie` or framework internals directly. It receives a
storage port; adapters live beside it:

```ts
interface SDKContext {
  getCookie(name: string): string | null;
  setCookie(name: string, value: string, opts?: CookieOptions): void;
  removeCookie(name: string): void;
}
createBrowserContext(): SDKContext                       // document.cookie adapter
createSSRContext(get, set, remove): SDKContext           // delegate to framework cookie utils
```

This is the ports & adapters arrow from ARCHITECTURE_PRINCIPLES.md applied across a package
boundary — and it is what makes the SDK testable and SSR-safe.

### Token-storage tradeoff — decide, write it down, never copy a default

| Option | Pros | Cons |
|---|---|---|
| httpOnly cookies + BFF proxy | JS can never read tokens (XSS-resistant) | needs a server tier; SDK stops managing tokens |
| JS-readable cookie (browser adapter) | pure SPA works; survives cross-site redirects | XSS can exfiltrate; demands short-lived access + rotating single-use refresh tokens |

The browser adapter above is the second option. If it also sets `SameSite=None` (cross-site
payment/auth redirects), CSRF protection moves to the API (origin validation, CSRF tokens).
Record the choice and its mitigations in `DECISIONS.md` — inheriting this template's default
silently is a finding in review.

## 4. Distribution — tags, no dist/ in git, verify the types

- **Tagged releases only.** Semver tag per release; consumers pin the tag:
  `"@{{PROJECT_NAME}}/sdk": "git+ssh://git@HOST/ORG/sdk.git#v1.4.2"` (or a registry pin).
  A consumer pointing at a branch is a build that changes under your feet.
- **Never commit `dist/`.** Gitignore it; build in CI at tag time. Committed artifacts go
  stale, hide build breakage, and poison code review.
- **Verify the published types after every build.** CI step: `npm pack`, install the tarball
  in a fixture project, `tsc --noEmit` on a file importing every public type (or run
  `@arethetypeswrong/cli`). "It built" is not proof the types shipped — see DELIVERY.md.

> ⚠️ **Gotcha:** declaration plugins skip `.d.ts` source files. Symptom: consumers hit
> "module has no exported member" for roughly half the public types. Cause: types were
> authored as `.d.ts` files; the dts generator treats those as already-compiled and emits
> nothing — 13 of 21 type modules silently missing from `dist/`, masked for months because
> a stale `dist/` was committed to git. Fix: author all types as plain `.ts`, never commit
> `dist/`, and gate releases on the type-verification step above.

## 5. Logging — injected, silent by default

Zero `console.*` in `src/`. The SDK accepts a logger port with a debug flag; default is a
no-op:

```ts
interface SDKLogger { debug(msg: string, meta?: object): void; error(msg: string, meta?: object): void; }
new SDK({ baseURL, sdkContext, logger: myLogger, debug: false })
```

Enforce with lint: `no-console: error` on `src/`.

> ⚠️ **Gotcha:** a production team left 9 `console.*` calls in the request hot path — every
> single API call logged method, URL and which auth tokens were present, into every
> consumer's production console. Unfilterable by consumers, noisy in tests, and a free map
> of the auth topology for anyone opening devtools. Fix: the injected logger above; debug
> output exists, but the *consumer* owns the switch.

## 6. Local-dev loop — link scripts in the consumer

Iterating on SDK + app simultaneously must be one command, not manual `package.json` edits:

```jsonc
// consumer package.json scripts
"sdk:local":  "npm pkg set dependencies.@{{PROJECT_NAME}}/sdk='file:../sdk' && npm install",
"sdk:prod":   "npm pkg set dependencies.@{{PROJECT_NAME}}/sdk='git+ssh://git@HOST/ORG/sdk.git#vX.Y.Z' && npm install",
"sdk:status": "npm pkg get dependencies.@{{PROJECT_NAME}}/sdk"
```

Guard rail: CI fails the consumer build if the SDK dependency is a `file:` path — local
links must never reach a commit on a shared branch.

## 7. Docs discipline — MIGRATION.md, and samples must compile

- Every breaking change gets a `MIGRATION.md` section: what changed (before/after code),
  why, impact, and the security implications if auth/cookies are involved.
- **Every code sample must compile against the real SDK surface.** Keep samples as actual
  `.ts` files type-checked in CI, or extract fenced blocks and run `tsc` over them.

> 📖 **War story:** a migration guide illustrated CSRF mitigation with a sample passing
> `headers` inside a resource-creation payload — an option no client method ever accepted.
> The sample was invented, it type-checked nowhere, and teams who pasted it shipped a no-op
> "security measure" believing they were protected. Docs with invented samples are worse
> than no docs: they convert a knowledge gap into false confidence.
