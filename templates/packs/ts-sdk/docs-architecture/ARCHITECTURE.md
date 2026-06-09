# ARCHITECTURE — Typed TypeScript SDK (the contract package)

This package is the **contract layer** of a multi-repo product: `backend → SDK → clients`
(MULTI_REPO_CONTRACT.md). From any consumer's seat, the whole package is **their L2 Data
brick** — the network client behind their repository implementations. Internally it runs
the universal L0–L5 lattice (ARCHITECTURE_PRINCIPLES.md) in miniature, exactly as
SDK_CONTRACT.md prescribes. Read both before touching this repo; this file maps them onto
TypeScript files.

## 1. Layer model — TS instantiation

```
L5  src/index.ts        composition root: constructs adapters, wires transport → auth →
                        resource clients, re-exports the ENTIRE public surface (and only it)
L3  src/clients/        one typed client per API resource + the secure-request use case
                        (single-flight token refresh lives in AuthClient)
L2  src/core/           adapters & ports: HttpClient (fetch transport), SDKContext
                        (storage port + adapters), withTimeout primitive
L1  src/core/Logger.ts  ops port: SDKLogger, no-op by default, debug-gated at the root
L0  src/types/          wire types mirroring backend DTOs — import NOTHING in the package
    src/errors/         ApiError + fromResponse normalization — imports types only
```

Tests live in `tests/`, stub the ports, and exercise the **public surface**
(`import … from '../src/index'`) so they double as compile-time proof of the exports.

## 2. Dependency direction

| Directory | may import | must NEVER import |
|---|---|---|
| `types/` | nothing | anything — a `types/` file with an import is a bug |
| `errors/` | `types/` | `core/`, `clients/`, `index.ts` |
| `core/` | `types/`, `errors/` | `clients/`, `index.ts` |
| `clients/` | core **ports** (`HttpTransport`, `SDKContext`, `SDKLogger`), `types/`, `errors/` | `fetch`/`document` directly, sibling clients, `index.ts` |
| `index.ts` | everything | — (sole assembly point) |

The import graph is the architecture — every violation is grep-visible:

```bash
grep -rn "fetch("        src/clients/ src/errors/ src/types/   # must be empty (transport port only)
grep -rn "console\."     src/                                  # must be empty (injected logger only)
grep -rn "from '.*clients" src/types/ src/errors/ src/core/    # must be empty (no upward imports)
grep -rln "document\.\|window\." src/ --include='*.ts'         # browser APIs only inside a storage adapter
```

> ⚠️ **Gotcha:** Symptom — a "tiny helper" in `types/` starts importing `ApiError`, then a
> client, and suddenly the types-only subpath drags the HTTP runtime into the consumer's
> pure L3 layer. Cause — runtime code creeping into `types/`. Fix — `types/` holds
> declarations only (interfaces, type aliases, string-literal unions); anything with a
> runtime body lives in `core/` or above.

## 3. The SDK from the consumer's seat

- Consumers import **`{{BUNDLE_ID}}`** (runtime: clients, errors, adapters) or
  **`{{BUNDLE_ID}}/types`** (wire types only, erased at compile time). Nothing else exists —
  the `exports` map is the law (MULTI_REPO_CONTRACT.md "Never bypass the SDK").
- Consumer L3 declares repository contracts and may reference `{{BUNDLE_ID}}/types`;
  consumer L2 implements those contracts by calling this SDK and mapping wire → domain.
  No consumer L3+ brick instantiates the SDK; their composition root (L5) wires it.
- Clients pin a **tag**, never a branch (MULTI_REPO_CONTRACT.md). Cutting a release here is
  what unblocks client work — see the release checklist in CONVENTIONS_TS.md.

## 4. Adding a resource client — the recipe

Backend first (its tests green, DTOs frozen), then here, then clients — always in that order.

1. **`src/types/`** — add wire types mirroring the new DTOs (plain `.ts`, no imports).
2. **`src/clients/FooClient.ts`** — thin, typed methods; secure endpoints take the
   `AuthClient`, public endpoints take the `HttpTransport` port directly:

   ```ts
   export class ProjectClient {
     constructor(private readonly auth: AuthClient) {}
     list(): Promise<Project[]> { return this.auth.request('GET', '/projects'); }
     create(draft: ProjectDraft): Promise<Project> { return this.auth.request('POST', '/projects', draft); }
   }
   ```

   No URL building beyond the path, no response re-parsing, no error catching — the
   transport normalizes errors (`ApiError`), the consumer maps them to UX (SDK_CONTRACT.md §2).
3. **`src/index.ts`** — construct it in the composition root, expose it as a readonly
   field, re-export the class and its wire types.
4. **`scripts/verify-dist.mjs`** — add the new public names to the surface list so the
   build gate proves the types actually shipped.
5. **`tests/`** — stub `HttpTransport`, assert method/path/payload and error mapping.
6. Build green → version bump → tag (CONVENTIONS_TS.md §8).

## 5. Auth — why `clients/AuthClient.ts` looks the way it does

The single-flight refresh contract (shared inflight promise, bounded wait, retry exactly
once, clear-tokens-on-failure) is specified in **SDK_CONTRACT.md §3** — read it before
touching `AuthClient`. Local invariants on top:

- `tests/singleFlight.test.ts` is the executable spec: N concurrent 401s ⇒ **exactly one**
  refresh call against a fake API that enforces *single-use* rotating refresh tokens. It
  also pins the timeout and failure paths. Never weaken or skip these tests.
- The refresh call itself goes through the raw transport, never through `request()` —
  a refresh that 401s must not trigger another refresh.
- Token storage goes through the `SDKContext` port. The skeleton ships the **memory
  adapter** only; adding a browser/SSR adapter is a recorded decision (token-storage
  tradeoff table in SDK_CONTRACT.md §3 → `DECISIONS.md`), never a copied default.

## 6. Build pipeline — dual output, verified types

```
npm run build  =  tsup (entries: src/index.ts + src/types/index.ts → esm + cjs + .d.ts)
                  THEN node scripts/verify-dist.mjs
```

`verify-dist.mjs` fails the build unless every expected `dist/` artifact exists **and**
every name on the public-surface list appears in the emitted declarations. "It built" is
not proof the types shipped (SDK_CONTRACT.md §4) — this gate makes the proof mechanical.

> ⚠️ **Gotcha:** Symptom — consumers report "module has no exported member" for types that
> visibly exist in `src/`. Cause — the types were authored as `.d.ts` files; declaration
> generators treat those as already-compiled and emit nothing for them. Fix — author all
> types as plain `.ts`; the verify-dist gate catches any regression at build time.

> ⚠️ **Gotcha:** Symptom — the SDK behaves differently in the consumer than in this repo's
> tests, and `git diff` is clean. Cause — a stale committed `dist/` shadowing fresh sources.
> Fix — `dist/` is gitignored here and must stay that way; artifacts are built at tag time,
> never reviewed, never committed.

## 7. Why this works with AI agents

- **Seconds-fast ground truth**: `npm run typecheck` and `npx vitest run` give precise
  feedback without any consumer app — iterate here before touching client repos.
- **Ports make tests cheap**: every client is testable by stubbing `HttpTransport`; no
  network, no mock servers, no global-fetch patching.
- **Grep-visible boundaries** (§2): an agent can verify the architecture with four greps.
- **Mechanical release gates**: verify-dist + the single-flight suite encode the two
  historical production failures as automated checks, so no session re-learns them.
