# Architecture Principles — the Lego Model (platform-agnostic)

These rules hold for ANY stack — iOS, Android, web, API. The platform pack (if installed)
instantiates them for your language; this file is the contract they all follow.

## The four layers

Every project is built from the same bricks, with dependencies pointing one way only:

```
1. DESIGN TOKENS / FOUNDATION    visual + base constants (colors, spacing, typography…)
2. DATA LAYER                    IO: repositories — protocols/interfaces + real impls
                                 (network, DB, cloud) + an InMemory impl for tests/previews
3. CORE (domain)                 pure business logic: models, engines, services.
                                 ZERO framework imports (no UI, no HTTP client, no ORM types)
4. PRESENTATION                  Module/ = reusable UI bricks · App/ = final screens/pages
                                 Store = observable app state, composition root · Tools = cross-cutting
```

**Dependency rule**: a layer may only depend on layers above it in this list — never sideways
into a sibling feature, never downward into presentation. Core imports nothing but the standard
library. If Core needs IO, it declares an interface; DataLayer implements it.

## Why these boundaries are non-negotiable

- **Core is pure** → testable in milliseconds on any machine, no emulator/simulator/browser.
  Engines take injected clocks/calendars/randomness; same inputs, same outputs, forever.
- **Repositories are swappable** → the app runs on InMemory data before any backend exists
  (demo day one), and tests never touch the network.
- **Modules are bricks** → a UI brick receives data and exposes callbacks (`onSave`, `onDelete`).
  It never imports the Store or another feature. Closures/props/events ARE the boundary.
- **Screens assemble** → App/ composes bricks + Store + navigation. Logic that isn't
  assembly does not belong there.

## Where does this file go? (decision table)

| You are adding… | It lives in |
|---|---|
| A business rule, calculation, domain model | Core |
| Anything that talks to network/disk/cloud | DataLayer (behind a Core interface) |
| A reusable visual component | Module/ (presentation bricks) |
| A screen/page the user navigates to | App/ |
| Observable app state, service wiring | Store (composition root) |
| A color, font, spacing value | Design tokens — NEVER inline in presentation code |
| Routing, logging, schedulers | Tools |

## Why AI agents thrive in this model

1. **Fast ground truth** — each brick builds/tests alone in seconds; agents iterate at the
   layer level before paying for a full app build.
2. **Grep-visible violations** — a UI import in Core or a hex color in a screen is caught by
   a one-line search; review is mechanical.
3. **Small blast radius** — bricks bound the context an agent must hold; session #20 can
   modify one module without re-reading the world.
4. **Tests are the spec** — every Core rule ships with its test in the same change. Agents
   re-derive intent from tests, not from stale prose.

## Naming

- Names express intent, not technology (`ItemRepository`, not `ItemAPIManager`).
- One type per file; the file is named after the type.
- Feature namespacing: scoped types (`Item.DetailCard`, `App.Feed`) over prefix soup.
