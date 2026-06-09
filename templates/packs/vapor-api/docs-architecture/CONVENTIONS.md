# CONVENTIONS — Server-Side Swift (Vapor 4, Swift 6 strict concurrency)

Prescriptive — follow as written. The layer rules live in `ARCHITECTURE.md`; this file is
about HOW each kind of code is written.

## 1. Feature module anatomy

- Namespace enum per feature: `extension App { enum Item { enum Controllers {}; enum Migrations {}; enum DTO {} } }`.
  Sub-enums exist ONLY for roles the feature actually has — don't pre-create empty ones.
- **One type per file**; file name = feature + role + type: `ItemControllersCrud.swift`,
  `ItemEntity.swift`, `ItemMigrationCreate.swift`, `ItemService.swift`, `ItemRepository.swift`.
- The front-door file (`AppItem.swift`) holds the namespace + ALL registration conformances —
  reading one file tells you everything the module plugs into.
- Checklist for a new feature `Foo`:
  1. Copy the `Features/Item/` shape → `Features/Foo/`.
  2. Conform `App.Foo.Controllers: ControllersRegister`, `App.Foo.Migrations: MigrationsRegister`.
  3. Add `try App.Foo.Controllers.register(app: app)` to `routes.swift`.
  4. Add `App.Foo.Migrations.register(app: app)` to `configure.swift` — positioned AFTER
     every table its schema references.
  5. Write the feature test (boot + endpoint + typed-error case) in `Tests/AppTests/`.

## 2. Typed errors — the public failure contract

Every intentional failure is a case of an enum in `Sources/App/Error/Failed.swift`:

```swift
enum BadRequest: CustomError {
    case dataNotValid
    func convert() -> HTTPStatus { .badRequest }   // ONE line — the generator parses this
}
// usage, in a Service:
guard !cleanName.isEmpty else { throw App.Failed.BadRequest.dataNotValid }
```

The middleware (`FailedMiddleware.swift`) serializes any thrown case as
`{"code": 400, "name": "dataNotValid", "description": "Bad Request"}` and increments the
error counter. Rules:

- **Feature code never throws raw `Abort`** and never builds error Responses by hand.
  `Abort` is tolerated only in infrastructure handlers (e.g. the /metrics gate).
- The **case name is the public identifier** — clients match on it. Renaming a case is a
  breaking API change; treat it like one.
- Throw from **Services** (business decisions) and Controllers (HTTP-shape problems like
  undecodable JSON). Repositories return facts (`nil`, `false`), never typed errors.
- `docs/ERROR_CODES.md` is **GENERATED** from the enum by `scripts/generate-error-codes.sh`.
  Never write it by hand; regenerate in the same commit that touches `Failed.swift`.
  A hand-written error table starts lying the week after it's written — the generated one
  cannot lie.

> ⚠️ **Gotcha:** Symptom — a client breaks on an error response with a shape nobody
> documented. Cause — someone threw `Abort(.badRequest, reason: "…")` in feature code,
> which bypasses the typed contract and produces Vapor's `{"error": true, "reason": …}`
> shape instead. Fix — grep `Abort(` over `Features/` in review; it should only hit
> infrastructure files.

## 3. Environment variables — typed, fail-fast, cross-checked

ONE pattern, no exceptions (`Sources/App/Configure/AppConfig.swift`):

- Every variable is a case of `AppConfig.Key` (CaseIterable). `Key.get` fail-fasts with
  the variable's NAME if missing — the service dies at boot, not at the first request
  that needed the value.
- `Environment.get` is called nowhere else. If you need a new value: add the Key case,
  add a typed property on `AppConfig`, add the line to `env_dist`, add it to every deploy
  manifest, run `bash scripts/validate-env-vars.sh`.
- Tests get `AppConfig.testing` through an EXPLICIT branch on `app.environment == .testing`
  — never sniff the test runner from process arguments, env leftovers, or CI flags. The
  environment is a parameter, not a guess.
- Config reaches code via `Application.storage` (`app.config` / `req.config`) — no global
  singleton. Singletons hide the dependency and make per-test configuration impossible.
- `LOG_LEVEL` is the single sanctioned exception: read in `entrypoint.swift` before
  config exists (logging must work even when configuration is broken).

> ⚠️ **Gotcha:** Symptom — deploy green, then the service dies at boot with a missing
> variable that "was added weeks ago". Cause — the variable was added to code and the dev
> .env, but never to the production manifest; nothing cross-checked them. Fix — the
> validate script runs in CI and blocks the merge, not the deploy.

## 4. DTOs — the wire contract

- `DTO.Input` / `DTO.Output` structs conforming to `Content`, one pair per resource shape.
- **Entities never serialize directly.** The entity is a persistence detail; the DTO is
  the public API. Renaming a DB column must never be an API-breaking change.
- `Output.init(entity:)` is the single mapping point — `try entity.requireID()` there,
  so an unsaved entity fails loudly instead of emitting a null id.
- Decode with intent: `guard let input = try? req.content.decode(...) else { throw App.Failed.BadRequest.jsonNotDecodable }`
  — undecodable JSON is a typed 400, not a Vapor default.

## 5. Concurrency (Swift 6, strict)

- Route handlers are `@Sendable` funcs on a struct `RouteCollection`.
- Services and Repositories are `Sendable` structs holding `let db: any Database` —
  created per request, no shared mutable state.
- Fluent models are `final class … Model, @unchecked Sendable` — the ONLY tolerated
  `@unchecked` in the codebase, imposed by Fluent. Containment rule in
  `GOTCHAS_LINUX_SWIFT.md`: entities never leave the request scope.
- **No `Task.detached`, no fire-and-forget `Task {}`** in request handlers. Work that
  outlives the request goes through a queued Job (see GOTCHAS — request-scoped resources
  die with the request).
- Process-wide one-time setup (metrics registry, log bootstrap) anchors to a lazy
  `static let` — thread-safe by language guarantee, no locks to get wrong.

## 6. Logging

- Always through `req.logger` / `app.logger` (request-scoped loggers carry request IDs).
  Never `print()` — invisible to the structured pipeline.
- **Values go in metadata, not in the message string**: the message is a stable label,
  metadata keys are queryable (`"duration_ms"`, `"path"`, `"error_type"`).
- Every `catch` that swallows or converts an error logs the operation name + the error.
- Never log secrets, tokens, or full request bodies. Probe paths (/health, /metrics) are
  excluded from request logs by `HTTPLoggingMiddleware` — keep it that way.

## 7. Naming quick reference

- Actions are verbs (`create`, `list`); queries are nouns; booleans read as assertions
  (`isBlank`, `monitoringEnabled`).
- Routes: plural resources, kebab-case path segments (`/api/items`, `/api/team-invites`).
- DB: snake_case columns, plural snake_case tables (`created_at`, `items`).
- Migrations: `Create`, `AddXxx`, `FixXxx` — named for what they do, append-only.
- Names express intent, not technology (`ItemRepository`, not `ItemDBManager`).
- Comments explain WHY (the decision, the trap), never what the code already says.
