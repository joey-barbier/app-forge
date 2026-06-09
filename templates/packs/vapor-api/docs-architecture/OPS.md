# OPS — Logging, Metrics, Docker, Runtime Configuration

How this service behaves in production. Everything here is already wired in the skeleton;
this doc explains the contract so changes don't silently break operations.

## 1. Logging

Two modes, decided once in `entrypoint.swift`:
- **Development**: Vapor's human-readable text handler.
- **Release**: `JSONLogHandler` (Monitoring target) — ONE JSON object per line on stdout,
  metadata flattened to top-level keys. Loki/Grafana/CloudWatch parse it without config.

Level precedence: `--log` CLI flag → `LOG_LEVEL` env var → default (`notice` in
production, `info` elsewhere). **The level is never hardcoded** — a hardcoded `.debug`
in configure once shipped to a production fleet and flooded the log store; runtime config
exists precisely so ops can turn verbosity up DURING an incident without a redeploy.

`HTTPLoggingMiddleware` (Monitoring) replaces Vapor's default route logger:
- adds `duration_ms` to every request log (monotonic clock — NTP-jump safe),
- skips `/health` and `/metrics` (probes fire every few seconds; logging them buries
  real traffic and inflates storage for zero information).

> ⚠️ **Gotcha:** Symptom — log volume explodes after adding an uptime monitor. Cause —
> probe endpoints logged like user traffic. Fix — exclusion list in the middleware init,
> not grep-filtering in the log store (you pay for ingestion before filtering).

## 2. Metrics

- Backend: swift-metrics API + Prometheus exporter. Feature code NEVER touches the
  metrics API directly — it calls Monitoring helpers (e.g. `recordHTTPError`), so the
  backend stays swappable and metric names stay consistent.
- The registry and `MetricsSystem.bootstrap` are **process-global** (`MetricsRegistry.shared`,
  a lazy `static let`). Bootstrap may only run once per process; tests boot many apps.
- `/metrics` endpoint contract:
  - Bearer token from `METRICS_TOKEN`, compared with `constantTimeCompare` — a plain
    `==` leaks token length and prefix timing to an attacker who can measure latency.
  - Monitoring disabled → 503 (scrapers alarm loudly instead of charting zeros).
  - `/health` stays unauthenticated (load balancers can't do auth); it returns liveness
    ONLY — no version, no dependency status, nothing enumerable.

## 3. Docker — the production image

`Dockerfile` is multi-stage; each choice is load-bearing:

| Choice | Why |
|---|---|
| Dependencies resolved in their own layer | `Package.*` unchanged → deps layer cached → rebuilds in seconds |
| `swift build -c release --static-swift-stdlib` | run image needs no Swift runtime — smaller, fewer CVEs to track |
| `-Xlinker -ljemalloc` (dynamic) | server-grade allocator; the STATIC jemalloc is incompatible with the static Swift runtime |
| `swift-backtrace-static` copied + `SWIFT_BACKTRACE` env | crashes print symbolized backtraces in the container — without it a production crash is one unusable line |
| dedicated `vapor` user, `USER vapor:vapor` | the API never runs as root; a container escape lands in an unprivileged account |
| `Public/`/`Resources/` copied `chmod -R a-w` | runtime can't mutate its own assets |
| `ARG/ENV LOG_LEVEL` | verbosity is deploy-time AND runtime configurable |
| `CMD serve --env production --hostname 0.0.0.0 --port 8080` | binds all interfaces INSIDE the container; the host decides exposure |

Build & run:
```bash
docker build -t my-service .
docker run --rm -p 8080:8080 --env-file .env my-service
```

> ⚠️ **Gotcha:** Symptom — TLS calls to external APIs fail only in the container
> (`unable to get local issuer certificate`). Cause — minimal run images ship without CA
> roots. Fix — `ca-certificates` stays in the run-image package list; never "fix" this by
> disabling certificate verification.

## 4. Runtime configuration

- All config flows through `AppConfig` (typed, fail-fast — see CONVENTIONS.md §3).
  A misconfigured service must die at boot with the variable's name in the crash log;
  orchestrators surface boot crashes immediately, while a lazy nil surfaces as a 3 a.m.
  500 storm.
- Secrets (DB password, metrics token, API keys) come from the orchestrator's secret
  store; `env_dist` documents the variable, never the value.
- Deploy checklist for any config change:
  1. `AppConfig.Key` case + typed property
  2. `env_dist` line
  3. every compose/CI manifest
  4. `bash scripts/validate-env-vars.sh` green
  5. secret created in the deploy environment BEFORE the deploy

## 5. Database operations

- Migrations run at boot (`app.autoMigrate()` in configure). Registration order is
  load-bearing — see `ARCHITECTURE.md` §5 and GOTCHAS.
- Connection pool: `maxConnectionsPerEventLoop` × event loops (≈ CPU cores) = total
  connections per replica. Size against the database's `max_connections` BEFORE scaling
  replicas, not after the pool exhaustion incident.
- Tests run on in-memory SQLite (zero infra), but SQLite is not PostgreSQL: anything
  using PostgreSQL-specific SQL needs a CI job against a real PostgreSQL service
  container before release.

## 6. Shipping checklist

```bash
swift test                                                        # host gate
docker run --rm -v "$PWD:/src" -w /src swift:6.2-noble swift test # Linux gate (the real target)
bash scripts/validate-env-vars.sh                                 # config drift
bash scripts/generate-error-codes.sh && git diff --exit-code docs/ERROR_CODES.md  # error doc current
docker build -t my-service . && docker run --rm -p 8080:8080 --env-file .env my-service
curl -s localhost:8080/health                                     # eyes-on proof
```
