# GOTCHAS — Swift on Linux (the deployment target)

Server-side Swift develops on macOS but RUNS on Linux, and the two are not the same
platform. Every entry below was paid for in production by a real team. Format:
**Symptom → Cause → Fix.** Add new entries with evidence only.

## 1. URLSession crashes on Linux — use AsyncHTTPClient, always

- **Symptom:** intermittent hard crashes in production: `Illegal instruction`, libcurl
  error 43 (`CURLE_BAD_FUNCTION_ARGUMENT`), memory corruption under concurrent load.
  Everything green on macOS.
- **Cause:** on Linux, `URLSession` comes from `FoundationNetworking` — a libcurl-based
  reimplementation with known race conditions in handle configuration. It is NOT the
  battle-tested Darwin stack you developed against.
- **Fix:** ONE HTTP client for the whole service: **AsyncHTTPClient**, reached through
  Vapor's managed instance `app.http.client.shared`. Inject it (init parameter or a
  config actor) into every client target — never construct ad-hoc `HTTPClient()`
  instances per call (each spawns an event loop group; you leak threads and FDs and must
  manage shutdown yourself).
  ```swift
  var request = HTTPClientRequest(url: url)
  request.method = .GET
  let response = try await httpClient.execute(request, timeout: .seconds(30))
  ```
  Enforcement is a grep: `grep -rn "URLSession" Sources/` must return nothing.

> 📖 **War story:** a production team migrated 18 call sites from URLSession to injected
> AsyncHTTPClient after chasing "random" illegal-instruction crashes for weeks. The
> crashes stopped the day the migration shipped.

## 2. Non-Sendable containment — Fluent entities stay in the request scope

- **Symptom:** Swift 6 data-race diagnostics around model classes; or, with checking
  silenced, corrupted field values under load.
- **Cause:** Fluent models are mutable `final class`es marked `@unchecked Sendable` —
  the annotation silences the compiler but provides zero runtime safety. An entity that
  crosses a task boundary (cached in a singleton, captured by a background task, passed
  between requests) is a shared-mutable-state bug.
- **Fix:** containment. Entities are born in a repository call and die at the controller
  edge, mapped to a `Sendable` DTO struct (`DTO.Output(entity:)`). Nothing reference-typed
  leaves the request. Caches and queues hold value types only.

## 3. Migration ordering only fails on FRESH databases

- **Symptom:** first deploy to a new environment crashes at boot:
  `relation "teams" does not exist`. Every developer machine and the long-lived staging
  DB boot fine.
- **Cause:** Fluent executes migrations in REGISTRATION order. Incrementally-migrated
  databases already have every table, so a wrong order hides for months until a
  from-scratch run (new region, new developer, disaster recovery — the worst possible
  moments).
- **Fix:** central, explicit, commented registration in `configure.swift`: foreign-key
  targets first. Any change to migrations gets verified against a scratch database
  (drop + full migrate) before merge.

## 4. Background work must not borrow request-scoped resources

- **Symptom:** intermittent `connection closed` / pool errors in work spawned from a
  handler with `Task { … req.db … }` or `Task.detached`; failures cluster under load and
  vanish locally.
- **Cause:** `req.db`, `req.client`, `req.logger` live in the request's lifecycle. The
  response returns, the request's resources are released, the orphaned task keeps using
  them.
- **Fix:** work that outlives the response goes through a persistent queue (Vapor Queues
  with a database/Redis driver) — survives restarts, retries on failure, uses its own
  connections. For app-lifetime (not request-lifetime) work only, use `app.db`/`app.logger`
  explicitly and deliberately.

## 5. `hashValue` is per-process — never persist or compare it across runs

- **Symptom:** cache keys, ETags, or dedupe markers computed with `hashValue` never match
  after a restart or between replicas; conditional requests never return 304.
- **Cause:** Swift's `Hashable` seeds its hash per process BY DESIGN.
- **Fix:** stable identity only: SHA-256 of the bytes, or a `version`/`updatedAt` column.
  See the ETag entry in `ANTI_PATTERNS.md` — this exact bug shipped to production.

## 6. macOS-green is not done — gate on Linux

- **Symptom:** CI on macOS passes; the Docker deploy crashes or behaves differently
  (Foundation gaps, file-path case sensitivity, locale/encoding differences).
- **Cause:** Foundation on Linux is a different implementation with a different surface;
  the filesystem is case-sensitive; the C library differs.
- **Fix:** the Linux gate is one command and runs before every ship:
  ```bash
  docker run --rm -v "$PWD:/src" -w /src swift:6.2-noble swift test
  ```
  CI runs the test job in a Swift Linux container, matching the Dockerfile's Swift version.

## 7. `MetricsSystem.bootstrap` may only run once per process

- **Symptom:** the app runs fine; the test suite crashes with
  `metrics system can only be initialized once per process` on the second booted app.
- **Cause:** swift-metrics enforces single bootstrap, but tests create many
  `Application`s, and bootstrap was wired per-application.
- **Fix:** anchor the registry + bootstrap to the process with a lazy `static let`
  (`MetricsRegistry.shared` in the Monitoring target) — thread-safe by language
  guarantee, runs exactly once, every app shares the registry.

## 8. `.env` is loaded from the WORKING DIRECTORY

- **Symptom:** `Missing environment variable …` fatal at boot although `.env` exists and
  is correct — typically when launching from an IDE, a systemd unit, or a script that
  `cd`s elsewhere.
- **Cause:** Vapor's `Environment.detect()` reads `.env` relative to the process working
  directory, not the binary location or the repo root.
- **Fix:** always launch from the project root locally; in production don't use `.env`
  files at all — the orchestrator injects real environment variables. The fail-fast
  `AppConfig.Key.get` turns this mistake into an immediate, named boot error instead of
  weird half-configured behavior.
