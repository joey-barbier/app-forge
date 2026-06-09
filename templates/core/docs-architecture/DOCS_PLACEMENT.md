# Docs Placement — where knowledge lives (the two-tier rule)

Documentation here is not for humans browsing a wiki — it is **loaded into AI agent context**
and treated as ground truth. A wrong doc is worse than no doc: the agent acts on it.
This file defines where each kind of knowledge must live so it stays true.

## The two-tier rule

**Tier 1 — umbrella / root docs** (`docs-architecture/`, root `CLAUDE.md`):
hold ONLY knowledge that survives refactors —

- **Contracts**: what each component promises the others (API shapes, SDK boundaries,
  event formats). The L3 repository contracts of ARCHITECTURE_PRINCIPLES.md are the model.
- **Ordering**: in what sequence work flows across components
  (e.g. "API first, then SDK, then clients" — the *rule*, never the file list).
- **Invariants**: the rules that make the system safe to change
  ("L3 Core Logic is pure", "tokens are the only source of visual values").
- **Infra topology**: what runs where, what talks to what, deployment shape.

**Tier 2 — colocated docs** (per-repo/per-module `CLAUDE.md` or `AGENTS.md`, `docs/`
folders next to code, doc comments): hold **every file-path fact** — module layout,
where a feature lives, which command builds this package, local conventions.

**The placement test:** *if a refactor could move a file and silently make the sentence
false, the sentence belongs next to that file — Tier 2.* A root doc must never name a
path inside a child component. Point at the component's own docs and stop.

## Why — a two-year natural experiment

> 📖 **War story:** A production team ran a multi-component product (API, web app,
> mobile app, JS SDK) for two years with both doc styles side by side.
> **Symptom:** agents kept editing the wrong files, "fixing" code that didn't exist, and
> citing a frontend stack two major versions out of date.
> **Cause:** the umbrella docs were path inventories. A root "component mapping" file —
> tables mapping every feature to exact file paths across four repos — was audited and
> found **~90% fiction**: the API's `Controllers/` directory had been dissolved into use
> cases and multi-target packages; the SDK had moved under another repo's umbrella and its
> service files renamed; the web framework's major upgrade had relocated the entire pages
> tree. The root "architecture" doc still claimed a static-CDN frontend (it had become
> SSR), the previous framework major version, and an HTTP library that was no longer a
> dependency. Nobody updates a doc they don't see while editing the code it describes.
> **Fix:** the team deleted the mapping tables outright. The colocated rule-style docs —
> per-repo conventions, invariants, gotcha logs — had stayed accurate the whole time,
> because *rules don't move when files do*. That asymmetry is this file's entire thesis.

## What goes where

| Knowledge | Lives in | Tier |
|---|---|---|
| Layer rules, dependency arrows (L0–L5) | `docs-architecture/ARCHITECTURE_PRINCIPLES.md` | 1 |
| Delivery method, memory protocol | `docs-architecture/DELIVERY.md` | 1 |
| Cross-component contracts & work ordering | `docs-architecture/` | 1 |
| Infra/deploy topology (what runs where) | `docs-architecture/` or `deploy/docs/` | 1 |
| "Component X handles Y — see `X/CLAUDE.md`" | root `CLAUDE.md` (pointer only) | 1 |
| Module layout, where features live | that module's `CLAUDE.md` / `docs/` | 2 |
| Build/test/run commands for a component | that component's docs + `.claude/memory/COMMANDS.md` | 2 |
| Per-repo conventions, naming, local rules | that repo's `CLAUDE.md` | 2 |
| Feature debriefs, gotchas | next to the code + PROJECT_STATE.md gotcha log | 2 |
| Slice blueprints | `docs/` of the component being sliced | 2 |

## Anti-pattern: the feature→file mapping table

**Docs that restate code rot the fastest.** A table mapping features to file paths is a
cache of the file tree with no invalidation — every refactor, rename, or framework upgrade
silently corrupts it, and nothing fails when it does.

Never write:

```markdown
| Feature | Backend | Frontend |
|---|---|---|
| Login | /api/src/controllers/AuthController.ts | /web/pages/login.vue |
```

The codebase already IS this table, always up to date. Agents have grep, glob, and LSP;
a stale map is strictly worse than a 2-second search. Write instead:

```markdown
Auth lives in the api component (L4 shared feature). Conventions and entry points:
see `api/CLAUDE.md`. Invariant: clients never mint tokens — only the API issues them
via the auth provider.
```

The same ban covers prose inventories ("the engine lives in `src/core/engine.ts`"),
directory-tree ASCII art for *other* components, and root docs listing another repo's
commands.

## Write invariants and war stories — never inventories

The durable doc sentences are the ones a refactor cannot falsify:

- **Invariant:** "L2 never imports L3 services — contracts and models only." True in any
  file layout. ✅
- **Contract:** "The SDK is the only sanctioned HTTP path for web clients; bypassing it
  to call the API directly is a bug." ✅
- **War story:** symptom → cause → fix (format below). Pays rent every time someone
  hits the same wall. ✅
- **Inventory:** "Controllers are in `Sources/App/Controllers/`." One restructure away
  from fiction. ❌ — move it to that package's own doc, where the person moving the
  files is staring at it.

> ⚠️ **Gotcha:** "But the inventory helps the agent find things faster."
> **Symptom:** it does — for the first month. **Cause:** after that it actively misleads:
> in the experiment above the agent confidently edited paths that had not existed for a
> year, and burned sessions reconciling doc vs reality. **Fix:** ship the *search recipe*
> instead ("routes are registered in one file per component — grep for the route
> registrar"), which stays true across renames.

## The staleness loop — code wins

Any doc line that claims a **path, command, version, or flag** is a liability with a
maintenance contract:

1. **On touch, spot-check.** Whenever a session reads such a claim before acting,
   verify it against the code first (one `ls`/grep). Never act on the claim directly.
2. **On conflict, code wins.** Same rule as DELIVERY.md's memory protocol: the doc is
   wrong, not the code. No exceptions.
3. **Fix in the same change.** Correct the line — or better, demote it to Tier 2 or
   delete it — in the very commit that revealed the rot. Stale claims found and left
   in place are bugs you chose to ship.
4. **On refactor, sweep.** Moving or renaming files? Grep the docs of *that component*
   for the old paths. The two-tier rule makes this tractable: only colocated docs can
   name paths, so the sweep never leaves the component.

## The feature debrief

After a hairy feature — anything that fought back — write a **short colocated debrief**
before moving on: 10–20 lines, next to the code it concerns (the module's `CLAUDE.md`
or `docs/`), with the durable parts mirrored into the memory files (DELIVERY.md):

- **What broke** — the 2–3 real obstacles, as gotcha blocks (symptom → cause → fix).
- **What to know** — the non-obvious decisions and the invariants they created.
- **What NOT to try** — dead ends, so the next session doesn't pay for them again.

A short debrief next to the code beats a wiki page every time: it loads into context
exactly when an agent works on that code, and it dies with the code when the code is
deleted — which is correct. Wiki pages outlive their subject and become Tier-1 fiction.

Wire it into the memory system: gotchas land in `PROJECT_STATE.md`'s gotcha log,
decisions in `DECISIONS.md`, newly-proven commands in `COMMANDS.md`. Memory files obey
the same staleness loop — they claim paths and commands, so they get spot-checked and
code wins.

## Summary card

1. Root docs: contracts, ordering, invariants, infra. **Zero child-component paths.**
2. Every file-path fact lives next to the code it describes.
3. No feature→file mapping tables — docs that restate code rot the fastest.
4. Write invariants and war stories; the codebase is its own inventory.
5. Path/command claims get spot-checked on touch; code wins; fix in the same change.
6. Hairy feature done → short colocated debrief + memory update, not a wiki page.
