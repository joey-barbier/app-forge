# {{PROJECT_NAME}} — Architecture Memory

> Project-specific structure decisions. The generic 6-layer model lives in
> `docs-architecture/ARCHITECTURE_PRINCIPLES.md` — this file records how THIS app instantiates
> them in THIS stack's module system (packages / workspaces / modules — whatever the pack uses).

## Layers (instantiated)
> Filled at kickoff once the stack is known. Map each layer (L0–L5) to a concrete location in
> this project's module system. Example shape — replace with the real paths:
- **L0 Foundation** — design tokens, base utilities: _(location TBD at kickoff)_.
- **L3 Core Logic** — domain entities + engines + repository contracts: _(location + entities TBD)_.
- **L2 Data** — repository implementations, clients, mapping: _(location TBD)_.
- **L4 Shared Features** — reusable feature bricks: _(none yet)_.
- **L5 Complete Features** — screens/pages/endpoints + wiring: _(none yet)_.

## Domain map
_(filled at kickoff: entity → layer location/file)_

## Deviations from the boilerplate
_(record any conscious deviation + why)_
