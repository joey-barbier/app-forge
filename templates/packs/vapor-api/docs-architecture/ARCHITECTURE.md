# ARCHITECTURE — Layered Vapor API (Swift 6, server-side)

Pattern for Vapor 4 APIs deployed on Linux. The service is assembled from SPM targets
(compiler-enforced walls) + role folders inside the App target (convention-enforced,
grep-verifiable). Read `ARCHITECTURE_PRINCIPLES.md` first — this maps it onto Swift.

## 1. Layer Model — Swift instantiation of the universal L0–L5 contract

```
L5  COMPLETE FEATURES   Sources/App/Configure/    entrypoint, configure, routes, AppConfig (composition root)
                        Features/<F>/Controllers/ HTTP boundary: routes, decode/encode DTOs
                        Features/<F>/DTO/          wire types (Input/Output Content structs)
L4  SHARED FEATURES     created on demand: logic needed by ≥2 feature modules gets its own
                        SPM target (e.g. an auth or billing module). Don't pre-create.
L3  CORE LOGIC          Features/<F>/Services/     BUSINESS RULES: validation, normalization,
                                                   typed errors, orchestration
                        Features/<F>/Entities/     Fluent models (domain shape + persistence mapping)
L2  DATA                Features/<F>/Repositories/ data access ONLY — answers "what does the DB say"
                        Features/<F>/Migrations/   schema changes (append-only)
                        Features/<F>/Jobs/         queued/scheduled work (created when needed; calls Services)
                        Sources/<X>Client/         one SPM target per external API (AsyncHTTPClient)
L1  OPS                 Sources/Monitoring/        SPM target: JSON logs, HTTP timing, metrics registry
L0  FOUNDATION          Sources/{{PROJECT_NAME}}Foundation/  SPM target: pure primitives, ZERO dependencies
```

Notes on the mapping:
- **Targets enforce the big walls.** Foundation and Monitoring cannot import App — the
  compiler guarantees it. External-API clients live in their own targets so they build
  and test without booting the app.
- **Folders enforce the rest.** Inside the App target, layers are roles within a feature
  module. The compiler can't help there, so the rules below must be grep-checkable.
- **Third-party frameworks are not layers.** Monitoring (L1) imports Vapor as
  infrastructure; the dependency rule governs imports between PROJECT bricks only.

## 2. Dependency Direction Rules

| Layer | May use | Must NEVER use | Why |
|---|---|---|---|
| Controllers (L5) | Services, DTO, `App.Failed` | Fluent queries, Repositories directly | HTTP translation only — logic in services stays testable without HTTP |
| Services (L3) | Repositories, Entities, Foundation, `App.Failed` | `Request`, `Response`, HTTP types | Services take plain values; one service = one testable unit |
| Repositories (L2) | Fluent + Entities | `App.Failed` business errors, Services, validation | A repository reports DB facts; deciding what they MEAN is L3 |
| Migrations (L2) | Fluent schema builder | Entities' current code for data backfill | A migration must stay valid when the model changes later |
| Monitoring (L1) | Vapor, metrics libs | anything in App | Reusable across services; no domain knowledge |
| Foundation (L0) | Swift stdlib + Foundation | everything else | Primitives stay portable and instantly testable |

Grep checks (run them when in doubt — empty output = healthy):
```bash
grep -rn "query(on:" Sources/App/Features/*/Controllers/   # controllers bypassing services
grep -rn "import Vapor" Sources/App/Features/*/Services/   # services seeing HTTP (Request/Response live in Vapor)
grep -rn "App.Failed" Sources/App/Features/*/Repositories/ # repositories making decisions
grep -rn "URLSession" Sources/                             # forbidden — GOTCHAS_LINUX_SWIFT.md
```

## 3. Feature modules — the unit of growth

One folder per feature under `Sources/App/Features/`, everything colocated by role.
`Features/Item/` is the REFERENCE module — copy its shape:

```
Features/Item/
├── AppItem.swift            namespace + registration surfaces (the module's front door)
├── Controllers/             RouteCollections
├── DTO/                     Input/Output Content structs
├── Entities/                Fluent models
├── Migrations/              append-only schema changes
├── Repositories/            data access
└── Services/                business logic
```

The namespace is an enum: `extension App { enum Item { … } }` — call sites read as domain
language (`App.Item.Service`), and registration is type-scoped, not global.

> ⚠️ **Gotcha:** Symptom — two features need the same service and one starts importing the
> other's folder. Cause — sideways dependency between sibling features. Fix — promote the
> shared logic to its own SPM target (L4) and have both features depend on it. A feature
> never reaches into a sibling feature.

## 4. Auto-registration — one line per feature, ever

Three protocols in `Sources/App/Registry/` (`ControllersRegister`, `MigrationsRegister`,
`MiddlewaresRegister`) give every module the same wiring surface:

```swift
// In the module:  AppItem.swift
extension App.Item.Controllers: ControllersRegister {
    static func allCases() -> [any RouteCollection] { [Crud()] }
}

// In Configure/routes.swift — the ONLY line the rest of the app sees:
try App.Item.Controllers.register(app: app)
```

Adding a feature touches exactly two central lines: its controllers in `routes.swift`,
its migrations in `configure.swift`. Everything else stays inside the module folder.
This is what keeps agent diffs small: a new endpoint never rewrites the bootstrap.

## 5. Migration ordering — explicit, central, load-bearing

`configure.swift > migrationsInit` registers every module's migrations **in an explicit
sequence**. Fluent runs them in registration order; a schema referencing another table
(foreign key) must be registered after that table's `Create`.

> ⚠️ **Gotcha:** Symptom — fresh deploy crashes with `relation "xxx" does not exist`,
> while every dev machine boots fine. Cause — dev databases migrated incrementally over
> weeks, so ordering bugs stay invisible; only a from-scratch migration run exposes them.
> Fix — order registrations by foreign-key dependency, comment WHY a module is positioned
> where it is, and verify every migration change against a scratch database (drop +
> re-migrate) before shipping.

## 6. Where Does a New File Go?

| You are adding… | It lives in… |
|---|---|
| A new endpoint for an existing feature | `Features/<F>/Controllers/` (+ DTO if the shape changes) |
| A business rule (validation, limits, workflow) | `Features/<F>/Services/` |
| A query, a DB lookup | `Features/<F>/Repositories/` |
| A schema change | `Features/<F>/Migrations/` — NEW file, registered after its FK targets |
| A queued/scheduled job | `Features/<F>/Jobs/` (conform a JobsRegister-style surface) |
| A whole new feature | `Features/<NewF>/` copied from the Item module shape |
| A new error case | `Sources/App/Error/Failed.swift` + regenerate ERROR_CODES (CONVENTIONS.md) |
| A new environment variable | `AppConfig.Key` + `env_dist` + manifests (CONVENTIONS.md) |
| An external API client | new SPM target `Sources/<X>Client/` using AsyncHTTPClient |
| A log/metric/middleware concern | `Sources/Monitoring/` |
| A pure helper (string, date, parsing) | `Sources/{{PROJECT_NAME}}Foundation/` |

## 7. Why This Works Exceptionally Well With AI Agents

- **Fast ground truth without infrastructure.** `swift test` boots the real app on
  in-memory SQLite — full middleware stack, real migrations, zero services to start.
- **Compiler-enforced walls where it counts.** An agent that makes Monitoring import App
  code gets a build error, not a slow architectural rot.
- **Grep-visible violations everywhere else.** Every folder rule above has a one-line
  grep; agents can self-audit before claiming done.
- **Predictable file placement.** The feature-module shape means an agent knows the 5–7
  files a feature needs; diffs stay small and reviewable.
- **The error contract is testable.** Typed errors make failure paths assertable
  (`#expect(error.name == "dataNotValid")`) — failure behavior survives refactors.

Build matrix an agent should run before claiming "done":
```bash
swift build && swift test                                   # full stack on the host
docker run --rm -v "$PWD:/src" -w /src swift:6.2-noble swift test   # Linux = the real target
bash scripts/validate-env-vars.sh                           # config drift check
```
