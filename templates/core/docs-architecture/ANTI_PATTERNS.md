# Anti-Patterns Register — what NOT to do (each one paid for)

Every entry below was found in production code and verified — none is hypothetical.
Treat this as a pre-flight checklist: before shipping a cache layer, an auth middleware,
a config provider or a doc, scan the matching section.

> **This register is template-owned and curated.** It ships read-only and is refreshed when
> you run `update --apply` — **edits made here are overwritten on the next update.** Do NOT add
> your project's own incidents to this file. When you hit a real anti-pattern in THIS project,
> record it in the **gotchas log in `.claude/memory/PROJECT_STATE.md`** (symptom → cause → fix) —
> that file is yours and `update` never touches it. Worth-generalizing lessons can be proposed
> upstream to this register; they don't live in your local copy.

Layer references (L0–L5) follow ARCHITECTURE_PRINCIPLES.md. Proof discipline follows
DELIVERY.md. Format per entry: **Symptom → Why it bites → Fix.**

---

## Caching & HTTP

### 1. Process-seeded hash as ETag
- **Symptom:** ETags computed from the language's built-in `hashValue`/`hash()` of the
  response body. Cache hit rate near zero behind a load balancer; clients re-download
  identical bodies.
- **Why it bites:** Swift's `hashValue` (and Python's `hash()`) are seeded **per process**.
  The same bytes produce a different ETag on every replica and every restart — conditional
  requests can never match. Bonus damage: the middleware decoded the full JSON body on
  every request just to decide cacheability.
- **Fix:** ETags must be stable across processes: SHA-256 (truncated) of the body bytes,
  or a version/updatedAt field from the resource. Decide cacheability from route + model
  metadata, never by re-parsing the response you just serialized.

> 📖 **War story:** a production team shipped ETag support and saw zero `304`s in the logs.
> Cause: per-process hash seed — three replicas, three ETags for the same body. Fix: content
> digest; conditional requests started matching the same day.

## Auth & Routing (L5)

### 2. Name-allowlist auth middleware
- **Symptom:** a global route middleware holding a hand-maintained array of page names
  that skip auth (`['index', 'pricing', 'features', …]`); everything else redirects to login.
- **Why it bites:** every new public page must be *remembered* into the list. Forget one
  and it silently vanishes behind auth — a public changelog page 302'd anonymous visitors
  to the homepage for weeks before anyone noticed. The list also drifts from the actual
  route table; nothing fails when they diverge.
- **Fix:** derive auth from **route meta** declared next to the page
  (`definePageMeta({ auth: false })` or equivalent): the middleware reads `to.meta`,
  default-denies, and new pages carry their own policy. One source of truth, at L5 where
  the route lives.

## Contracts & Dependencies

### 3. Deep imports into a dependency's internals
- **Symptom:** app code importing `your-sdk/src/types/*` (internal paths) instead of the
  package's public entry point — found in 22 files of one consumer.
- **Why it bites:** it bypasses the public contract; any internal refactor of the SDK
  (moving a file, renaming a folder) breaks 22 call sites in a *different repo*. The import
  graph **is** the architecture — deep imports make it a lie.
- **Fix:** import only from the package root / declared `exports`. Enforce: `exports` field
  in the SDK's package.json (makes deep paths unresolvable) + `no-restricted-imports` lint
  rule in consumers.

### 4. `console.log` in SDK hot paths
- **Symptom:** a shared SDK logging request/response details straight to `console.log`
  (9 occurrences) on every call.
- **Why it bites:** every consumer's console fills with another library's traffic — request
  payloads included. No way to silence it, filter it, or route it. The log sink is an L1 Ops
  decision owned by the app; an L2 library hardcoding it seizes a choice the consumer can
  never override (and in pure L3 code, logging IO has no place at all).
- **Fix:** inject a logger interface (default: no-op) and gate verbosity behind an explicit
  `debug` flag the consumer sets. The SDK never decides where logs go.

### 5. Unpinned git dependencies
- **Symptom:** a package consumed via `git+ssh://…#main` — branch HEAD, no tag, no lockfile
  protection across fresh installs.
- **Why it bites:** every clean install pulls whatever the branch points to *today*. A
  breaking SDK change lands silently in consumers' next CI run; "works on my machine"
  becomes literally true and useless.
- **Fix:** pin to a tag or commit SHA (`#v1.4.2`), or publish proper semver releases.
  Upgrades become deliberate diffs, not surprises.

## Configuration & Ops (L1)

### 6. Test-detection heuristics in production config
- **Symptom:** the global config provider sniffing for the test framework at runtime —
  checking `XCTestConfigurationFilePath`, `xctest` in process arguments, `PackageTests`
  in the binary name, plus a `CI` + database-hostname combo — and swapping the entire
  config to mocks when any heuristic matches.
- **Why it bites:** production behavior forks on *test-framework presence*, not on declared
  intent. The heuristics rot as runners evolve, and a matching env-var combination in any
  non-test context silently flips real config to mock values. Debugging this is archaeology.
- **Fix:** one explicit variable (`APP_ENV=test`) set by the test harness; the provider
  reads it and nothing else. Better: inject config into the composition root so tests pass
  their own — no global singleton to fork.

### 7. Hardcoded log level overriding the env var
- **Symptom:** `app.logger.logLevel = .debug` hardcoded in `configure()`, executed *after*
  logging bootstrap — the `LOG_LEVEL` env var exists, is documented, and does nothing.
- **Why it bites:** debug logs in production: noise, log-storage cost, and request data in
  plaintext. Worse, the config **lies about being configurable** — operators set the env
  var, see no effect, and lose trust in every other knob.
- **Fix:** read the level from the environment with a quiet production default
  (`.info`/`.notice`). If a hardcode is ever needed for local work, gate it behind
  `#if DEBUG` and a comment saying so.

### 8. Feature flags that default OPEN
- **Symptom:** flag parsing like `enabled = value.lowercased() != "false"` — anything that
  isn't the exact string `false` (a typo, `"0"`, `"no"`, an empty default) turns the
  feature **on**.
- **Why it bites:** misconfiguration becomes silent activation. The dangerous failure mode
  (feature unexpectedly live) is the *default* failure mode.
- **Fix:** fail closed. Parse with an explicit truthy allowlist (`"true"`, `"1"`); missing
  or unrecognized values mean **off**, and log a warning naming the variable.

## Concurrency & Lifecycle (L2)

### 9. Detached background task on a request-scoped resource
- **Symptom:** a fire-and-forget `Task { … }` spawned inside a request handler, capturing
  the request's database connection to do slow work after the response is sent.
- **Why it bites:** the request-scoped connection returns to the pool when the response
  completes; the background task then races a closed — or worse, *reused* — connection.
  Intermittent failures, occasionally someone else's transaction.
- **Fix:** background work uses **application-scoped** resources (the app's database
  handle, an injected context) or a proper job queue. Rule of thumb: anything outliving
  the response must not hold anything scoped to the request.

## Testing

### 10. Testing theater
- **Symptom:** `package.json` scripts invoking Playwright with **no Playwright dependency
  installed** — the scripts cannot run from a clean checkout. A stale `playwright-report/`
  committed to the repo as "proof" the tests once passed.
- **Why it bites:** test claims that can't be executed are worse than no tests: they grant
  false confidence and rot invisibly. DELIVERY.md's contract is *proof over claims* — a
  committed report is a claim, a green run is proof.
- **Fix:** every test script must run from a clean checkout in CI, or be deleted. Generated
  reports go in `.gitignore`, never in version control.

## Documentation

### 11. Docs that restate code
- **Symptom:** static mapping tables, per-folder `AGENTS.md` inventories listing what each
  directory contains — every instance checked was stale.
- **Why it bites:** a doc that mirrors structure drifts the moment the structure moves, and
  agents/newcomers trust the stale copy over the code. On conflict, code wins — so the doc
  was only ever a liability.
- **Fix:** document *intent and invariants*, never inventory. Placement rules in
  **DOCS_PLACEMENT.md** decide what deserves prose at all.

### 12. Two documentation roots
- **Symptom:** both `docs/` and `documentations/` at the repo root, with overlapping,
  diverging content.
- **Why it bites:** nobody knows where truth lives, so contributors update one (or neither)
  and readers trust whichever they find first. Two roots = zero canonical sources.
- **Fix:** one root (`docs/`), one redirect commit to merge the other, done. See
  DOCS_PLACEMENT.md for what goes where inside it.

### 13. Hand-written docs that look generated
- **Symptom:** an `ERROR_CODES.md` formatted like tool output, maintained by hand — and
  drifted from the error enum it claimed to mirror.
- **Why it bites:** readers assume generated docs are exact, so drift here is actively
  misleading — worse than no doc. The enum was the truth all along.
- **Fix:** if a doc mirrors code, **generate it from code** (build step or CI check that
  fails on drift). If generating isn't worth it, delete the doc and link to the source file.

---

## Recording an anti-pattern you hit

Your incidents go in **`.claude/memory/PROJECT_STATE.md`** (gotchas log), never in this
template-owned file — `update --apply` would erase an edit here.

1. It happened **here**, in real code — link the commit or file.
2. Write it as symptom → cause → fix, 3–6 lines. Generic names, no blame.
3. If the fix changed a layer rule or convention, record it in `.claude/memory/DECISIONS.md` too.
4. If the lesson is broadly reusable across projects, propose it upstream so a future `update`
   ships it to this curated register for everyone.

> ⚠️ **Gotcha:** an entry only works if it stays falsifiable. "Avoid bad caching" teaches
> nothing; "per-process hash seed broke ETags across replicas" prevents a repeat.
