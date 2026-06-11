# Architecture Principles — the 6-Layer Lego Model (every stack, every language)

This is the universal contract. iOS, Android, web, API — the platform pack instantiates
these layers for your language, but the layers themselves never change.

## The layers

```
L5  COMPLETE FEATURES     final user-facing features: screens/pages/endpoints, app state,
                          composition root. Assembles everything below. Throwaway by design.
L4  SHARED FEATURES       feature bricks reused by several complete features
                          (auth flow, paywall, media picker, share sheet, comment thread…)
L3  CORE LOGIC + CORE UI  the heart, two siblings at the same level:
                          · Core Logic — domain models, engines, services, repository CONTRACTS.
                            Pure: no UI framework, no IO framework. Injected clocks/calendars.
                          · Core UI — reusable, domain-blind components (buttons, cards, lists,
                            inputs) built on the design tokens.
L2  DATA                  IO: repository implementations, network/DB/cloud clients,
                          DTO ↔ domain mapping, caching, sync.
L1  OPS                   operational plumbing: remote config, feature flags, analytics,
                          logging, crash reporting, monitoring, push registration.
L0  FOUNDATION            primitives: design tokens (colors/spacing/typography), base
                          extensions, formatters, tiny utilities. Zero dependencies.
```

## The dependency rule

**A layer may only import layers strictly below it.** Never sideways (a feature never
imports a sibling feature), never upward.

```
L5 → L4, L3, L2, L1, L0
L4 → L3, L2, L1, L0
L3 → L1, L0                       (L3 never imports L2 — it stays IO-free)
L2 → L3 contracts*, L1, L0        (* the one sanctioned upward arrow — see below)
L1 → L0
L0 → nothing
```

> **The one sanctioned upward arrow — ports & adapters.** The only arrow that points up is
> **L2 → L3**, and even that is narrow. Core Logic (L3) declares the repository **contracts**
> (interfaces) and the domain models it needs; Data (L2) *implements* those contracts, so L2
> imports them. **L3 itself never imports L2** — it knows nothing of the IO layer; it depends
> only on its own contracts, which L2 satisfies. That implementation import (L2 → L3 contracts)
> is the only upward arrow allowed, and it may touch **interfaces and models only — never
> services or engines**.
> Why: tests and previews run against an InMemory implementation of the contract without
> dragging in CloudKit/HTTP/ORM; the real backend stays swappable.

Everything else is absolute:
- **L3 Core Logic is pure.** No UI imports, no IO imports. If it needs the network, it
  declares a contract; L2 implements it. Injected `Calendar`/clock/randomness — never read
  the system clock inside an engine.
- **L3 Core UI is domain-blind.** A button doesn't know what an "Order" is. Domain-aware
  composites belong to L4.
- **L4/L5 communicate by callbacks/props/events** (`onSave`, `onDelete`) — a brick never
  reaches into app state on its own.
- **L0 tokens are the only source of visual values.** A hardcoded color in L4/L5 is a bug.

## Placing a new brick — the algorithm

The named bands above are the canonical shape, but a brick's level is not picked from a
category — it is **computed from its dependencies**:

> **Start at L0. Climb only when a dependency forces you up.**
> A brick's level = (highest level among the bricks it imports) + 1. Place it as LOW as it
> can possibly live.

Worked example — adding a `Monitoring` brick:
1. Assume **L0**… but it needs base formatters from Foundation → it must sit above L0 → **L1**.
2. At L1… but it reads sampling rules from remote config, which lives in Ops (L1) → above L1 → **L2**.
3. At L2 nothing else pushes it up → **it lands at L2.** Done — even though "monitoring"
   *sounds* like Ops, its dependencies decide, not its name.

Corollaries:
- A brick that keeps climbing is a smell: split it (the pure part stays low, the consuming
  part moves up).
- **~6 levels is the maximum.** If you need a 7th, you are over-slicing — merge bands.
- Re-run the algorithm when a brick gains a dependency; it may need to move up (or the
  dependency may belong lower).

## This applies to EVERY stack — including APIs

The layer discipline is not a UI concern. A backend has the exact same lattice:

```
L5  routes/controllers, app bootstrap, DI wiring
L4  shared feature modules (auth flow, billing, webhooks)
L3  use cases / domain services / entities / repository contracts
L2  repository impls, DB access, external API clients (Stripe, auth provider…)
L1  ops: remote config, feature flags, metrics, structured logging
L0  primitives: shared types, formatters, base extensions
```

Same absolute rule downward-only: a repository (L2) never calls a use case (L3); a use case
never imports a controller; **and no brick ever calls an SDK/client that lives above its own
level** — if you need it, you are at the wrong level, or the SDK is.

## Where does this file go? (decision table)

Typical band per kind of file — **the placement algorithm above has the final word**:

| You are adding… | Layer |
|---|---|
| A color, spacing, font, date formatter, small extension | **L0** Foundation |
| Remote config, feature flag, analytics event, logger setup | **L1** Ops |
| A repository implementation, API client, DB access, DTO mapping | **L2** Data |
| A business rule, domain model, engine, service, repository contract | **L3** Core Logic |
| A reusable domain-blind component (button, card, badge, empty state) | **L3** Core UI |
| A feature brick used by ≥ 2 features (auth, paywall, picker) | **L4** Shared Features |
| A screen/page/endpoint, navigation, app state, service wiring | **L5** Complete Features |

When in doubt between L4 and L5: start in L5, promote to L4 on second use.

## Physical mapping

Each platform pack maps layers to its module system (packages, gradle modules, workspaces…).
Two rules survive any mapping:
1. **Lower layers must build & test standalone** — fast feedback without booting the app.
2. **The import graph is the architecture.** If the module system can't enforce an arrow,
   a grep must be able to detect the violation.

## Why AI agents thrive in this model

1. **Fast ground truth** — L0–L3 build/test in seconds; agents iterate there before paying
   for full app builds.
2. **Grep-visible violations** — a UI import in L3 logic or a hex color in L5 is one search away.
3. **Small blast radius** — layers bound the context an agent must hold per change.
4. **Tests are the spec** — every L3 rule ships with its test; intent survives sessions.

## Naming
- Names express intent, not technology (`ItemRepository`, not `ItemAPIManager`).
- One type per file; the file is named after the type.
- Feature namespacing: scoped types (`Item.DetailCard`, `App.Feed`) over prefix soup.
