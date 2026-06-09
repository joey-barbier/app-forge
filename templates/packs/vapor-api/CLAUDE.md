# {{PROJECT_NAME}} — Claude Code Operating Manual

This project was scaffolded by **AppForge** (pack: vapor-api): a Claude-Code-first
server-side Swift architecture extracted from production APIs. You (Claude) are the team
lead AND the primary developer. Follow this manual exactly — it encodes hard-won lessons,
not preferences.

## Identity
- Service: **{{PROJECT_NAME}}** · Identifier: `{{BUNDLE_ID}}` · Swift 6 (strict concurrency)
- Stack: Vapor 4 + Fluent + PostgreSQL (tests run on in-memory SQLite — zero external services)
- **Deployment target is Linux (Docker).** macOS-green is NOT done — Linux behaves differently
  (see `GOTCHAS_LINUX_SWIFT.md`).

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
| ship/consume a typed SDK | `SDK_CONTRACT.md` |
| accept user-supplied URLs (webhooks…) | `SECURITY_USER_URLS.md` |
| write any documentation | `DOCS_PLACEMENT.md` |
| add caching/feature flags/auth shortcuts | `ANTI_PATTERNS.md` |
| add/move any file, create a feature module | `ARCHITECTURE.md` |
| write any Swift code (errors, env vars, DTOs, registration) | `CONVENTIONS.md` |
| logging, metrics, Docker, deploy, runtime config | `OPS.md` |
| HTTP clients, background tasks, migrations, anything Linux | `GOTCHAS_LINUX_SWIFT.md` |

Layer summary (universal contract in ARCHITECTURE_PRINCIPLES.md, Swift mapping in ARCHITECTURE.md):
L0 `{{PROJECT_NAME}}Foundation` target (pure primitives) · L1 `Monitoring` target (logs/metrics) ·
L2 feature `Repositories/` + `Migrations/` + external client targets · L3 feature `Services/` + `Entities/`
(**business logic lives in services, never repositories**) · L5 `Controllers/` + `DTO/` + `Configure/`.
Imports point downward only; SPM targets enforce the big walls, folders + grep enforce the rest.

## Non-negotiable rules
- **Typed errors only**: feature code throws `App.Failed.*` cases — never raw `Abort`, never stringly
  errors. `docs/ERROR_CODES.md` is GENERATED from the enum (`./scripts/generate-error-codes.sh`),
  never hand-written.
- **Env discipline**: every environment variable is a case of `AppConfig.Key` (typed, fail-fast at
  boot) AND a line in `env_dist` AND present in every deploy manifest. `./scripts/validate-env-vars.sh`
  must pass before any commit that touches config.
- **ONE HTTP client**: `app.http.client.shared` (AsyncHTTPClient), injected into whatever needs it.
  `URLSession` is FORBIDDEN — it crashes on Linux (see GOTCHAS_LINUX_SWIFT.md).
- **Migration order is load-bearing**: new migrations are registered explicitly in `configure.swift`,
  positioned after every table they reference. Verify on a scratch database, not your incremental dev DB.
- **Log level comes from the environment** (`--log` flag or `LOG_LEVEL`), never hardcoded. JSON logs
  in production, text in development — already wired in `entrypoint.swift`.
- **Never claim done without proof**: `swift test` green + (for endpoints) a curl/test response you
  actually read. Before shipping: run the test suite inside a Linux container (command in COMMANDS.md).
- **Memory is law**: contradictions between memory files and code → code wins, then fix the memory file.

## Build commands
```bash
swift build                         # compile all targets
swift test                          # full suite — boots the app on in-memory SQLite
swift run App serve --hostname 127.0.0.1 --port 8080    # needs .env + PostgreSQL
curl -s localhost:8080/health       # liveness proof

# Linux gate (the real deployment target) — run before shipping:
docker run --rm -v "$PWD:/src" -w /src swift:6.2-noble swift test
```
More (DB bootstrap, scripts, Docker image) in `.claude/memory/COMMANDS.md`.

## Git
- Never push without explicit user approval. Feature branches; commit format `add/update/fix(scope) - description`.
- No AI attribution in commits or file headers.
