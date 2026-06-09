# Multi-Repo Contract — backend → SDK → clients, one order, no exceptions

When {{PROJECT_NAME}} spans several repos (API, SDK, web, mobile…), the repos form a
dependency graph exactly like layers inside one codebase. This file is the cross-repo
analog of ARCHITECTURE_PRINCIPLES.md: **imports point downward — between repos too.**

## The repo lattice

```
CLIENTS   web app, mobile app, CLI, integrations     consume the SDK's public surface only
   ↓ depends on
SDK       typed client library: services, DTOs,      the API contract, made importable
          auth/session handling, error normalization
   ↓ depends on (wire protocol only — HTTP/GraphQL/gRPC)
BACKEND   the API: routes, domain, persistence        knows nothing about SDK or clients
```

Mapping to the 6-layer model:
- Each repo internally runs its **own full L0–L5 lattice** (the API too — see
  "This applies to EVERY stack" in ARCHITECTURE_PRINCIPLES.md).
- From a client's point of view, **the SDK is its L2 Data brick**: network client +
  DTO ↔ domain mapping. The in-repo rule "a layer imports only layers strictly below it"
  becomes "a client imports only the SDK's public surface."
- The backend is *below* everything: it never imports the SDK, never special-cases a
  client. Upward knowledge is a violation, same as L2 calling L5.

## Implementation order — backend first, SDK second, clients last

Every cross-repo change follows dependency order. No parallel starts, no "I'll stub it":

| Step | Repo | Work | Gate before the next step starts |
|---|---|---|---|
| 1 | **Backend** | model/migration, use case, route, DTOs, tests | backend tests green; endpoint reachable (curl proof); DTOs frozen for this slice |
| 2 | **SDK** | types mirroring the DTOs, service method, error mapping, tests | SDK builds + type-checks; tests green; version bumped; new surface exported from the public entry point; **tagged** |
| 3 | **Clients** | upgrade pinned SDK tag, wire UI/state, integrate | client builds against the tag; feature verified eyes-on (DELIVERY.md validation etiquette) |

Rules around the order:
- **A gate failing blocks the next layer.** Never start SDK work against a backend whose
  tests are red; never start client work against an SDK that doesn't build or type-check.
- **Bug fixes follow the same arrow.** Locate the most upstream repo that owns the defect,
  fix it there with a regression test, then propagate downstream. Patching around a backend
  bug inside a client creates two bugs.
- **Dependency upgrades propagate in the same order**: backend → SDK → clients, validating
  each repo before touching the next.
- **Business rules live in the backend, once.** The SDK transports them, clients render
  them. Client-side validation is UX sugar; the backend is the source of truth. Duplicated
  domain logic across repos *will* diverge.

## Never bypass the SDK

The SDK's public surface **is** the contract. Two absolute prohibitions for clients:

1. **No direct API calls.** A `fetch`/HTTP call to the backend from client code is a
   violation, even "just for this one endpoint." If the SDK lacks the method, the SDK is
   behind — fix step 2 before step 3, never around it.
2. **No deep imports.** Clients import the SDK's published entry point only — never
   `sdk/src/*`, never `sdk/dist/internal/*`. Enforce mechanically: the SDK's package
   manifest declares an `exports` map with a single public entry; anything not exported
   does not exist. Deep-importing internals is the cross-repo version of L5 reaching into
   L2's private parts.

Both violations are grep-visible (rule 2 of "Physical mapping" in
ARCHITECTURE_PRINCIPLES.md): `grep` clients for the raw API base URL and for deep-import
paths in CI.

> ⚠️ **Gotcha:** Symptom — a client's build explodes after an SDK *patch* release, errors
> deep inside `node_modules`. Cause — the client deep-imported an internal module the SDK
> moved during a refactor; internals carry no compatibility promise. Fix — consume only the
> public entry point; if you need something internal, promote it to the public surface via
> an SDK release.

**One SDK per language ecosystem.** A client platform with no SDK in its language (e.g. a
native mobile app next to a TypeScript SDK) builds a dedicated API-client module in its own
L2 — a mini-SDK. Same rules apply to it: single API surface in one place, typed DTOs,
normalized errors, no scattered HTTP calls from feature code.

## Breaking-change protocol

Repos deploy independently — there is **no atomic cross-repo merge**. Design for the window
where old clients talk to the new backend:

1. **Backend lands the change first.** Prefer expand/contract: add the new field/endpoint,
   keep the old one serving until all clients have migrated, remove it later. Version the
   route (`/v2/...`) when the shape change can't be additive. Backend tests green.
2. **SDK adapts**: types and services updated, error mapping verified, **semver bump**
   matching the impact (breaking → major, or minor below 1.0 — pick one convention and
   write it in the SDK README), plus a dated **MIGRATION.md entry**: what broke,
   before/after snippets, why. Tag the release.
3. **Each client upgrades deliberately**: bump the pinned tag in its own PR, follow the
   MIGRATION.md entry, run the client's full gate. Clients migrate at their own pace —
   that's the point of the contract.

Never: merging a backend breaking change and "fixing the clients later today." Later today
is when production traffic from yesterday's mobile build hits the new shape.

> 📖 **War story:** Symptom — users logged out every time they returned from an external
> payment page; no client code had changed. Cause — a session-cookie policy change shipped
> from the SDK's auth layer without a migration note, so client teams couldn't connect the
> regression to the upgrade. Fix — the change was re-released with a MIGRATION.md entry
> (before/after config, the cross-domain redirect rationale), and "breaking change ⇒
> MIGRATION entry + version bump" became a hard gate on SDK releases.

## Pin SDK versions by tag — never branch HEAD

Clients pin the SDK to an **immutable reference**: a published registry version or a git
tag (`#v0.12.0`). Never a branch, never an implicit HEAD.

- A branch reference makes every fresh install (CI, deploy server, new laptop) resolve to
  *whatever the branch is that day*. Your client's behavior changes with zero diff in its
  own repo — unreproducible builds, undebuggable regressions.
- Upgrading the SDK is always an **explicit, reviewable diff** in the client repo: one line,
  one PR, one changelog entry to read.
- Lockfiles help but don't save you: they're bypassed by fresh resolution paths and they
  hide *intent* — the manifest must state the exact version you mean.

> 📖 **War story:** Symptom — a production frontend deploy broke on a Friday with an empty
> diff; the same commit had deployed fine on Monday. Cause — the SDK dependency was a git
> URL pointing at a branch with no tag; a breaking SDK change merged mid-week, and the
> deploy's fresh `install` silently pulled the new HEAD. Fix — pin by tag, upgrade via
> explicit PRs; the team also added a CI check rejecting any git dependency without a
> pinned ref.

**Local development linking.** While building an SDK change you need the client to consume
your working copy. Use your package manager's link/workspace mechanism or a `file:` path,
behind two scripts in the client (`sdk:local` switches to the local path, `sdk:prod`
restores the pinned tag). The local link **never gets committed** — CI should fail on a
`file:` or `link:` SDK dependency reaching the main branch.

## How this composes with vertical slices (DELIVERY.md)

A vertical slice doesn't stop at a repo boundary — **a slice crosses all repos, in
contract order**:

```
Slice N:  BACKEND (its own L3 → L2 → L5 loop, tests + curl proof)
        → SDK     (types + service + tests, build, bump, tag)
        → CLIENT  (upgrade pin, L3/L4 bricks, L5 screen, eyes-on proof)
```

- The slice blueprint (DELIVERY.md) lists **files per repo per layer**, not just per layer.
- A cross-repo slice typically means one PR per repo, merged in dependency order, **each
  leaving its repo shippable** — the backend with the new endpoint live is shippable even
  before any client uses it (that's expand/contract working for you).
- The slice is **done** only on end-to-end proof: the feature visible in at least one real
  client, against the deployed backend — not when the backend tests pass.
- InMemory caveat: inside a client, early slices may run on an InMemory L2 implementation
  (DELIVERY.md build loop step 2). That's fine *within* the client repo — but the moment
  the slice goes live, the real L2 is the SDK, under all the rules above.

## Checklist (per cross-repo change)

- [ ] Backend tests green + endpoint proven before SDK work started
- [ ] SDK builds, type-checks, tests green; version bumped; release tagged
- [ ] Breaking change ⇒ MIGRATION.md entry with before/after
- [ ] Clients consume the public SDK surface only (no raw API calls, no deep imports)
- [ ] Client SDK pins are immutable tags; upgrade is an explicit PR
- [ ] No `file:`/`link:`/branch SDK reference on the main branch
- [ ] Slice proven end-to-end in a real client before being called done
