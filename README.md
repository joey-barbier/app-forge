# ⚒️ AppForge

**Turn Claude Code into an autonomous app factory — for any platform.**

One command scaffolds a project where Claude Code isn't an assistant, it's the **team
lead**: it interviews you, writes the PRD, plans vertical slices, then builds your app
autonomously — with tests, builds and on-screen proof at every step.

Everything in here was extracted from real production apps built ~100% with Claude Code,
including the bugs that cost days — written down so no one pays for them twice.

## Quick start

```bash
npx app-forge init MyApp        # questionnaire: platform, identifier
cd MyApp
claude
> /kickoff                      # describe your idea — Claude builds it
```

## The Lego model

AppForge separates **what is universal** from **what is platform-specific**:

```
┌─────────────────────────── UNIVERSAL CORE (always installed) ───────────────────────────┐
│  ARCHITECTURE_PRINCIPLES.md   the 4-layer lego model — tokens → data → core → UI        │
│  DELIVERY.md                  vertical slices, proof-over-claims, memory protocol       │
│  skills/                      /kickoff (team lead) · /product-owner (PRD) ·             │
│                               /restore-context · /save-context                          │
│  .claude/memory/              persistent project memory (anti-hallucination)            │
│  .mcp.json                    context7 (up-to-date docs for any library)                │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                          +
┌─────────────────────────── PLATFORM PACK (chosen at init) ──────────────────────────────┐
│  swift-ios   ✅  Swift 6.2 · SwiftUI · CloudKit/CKShare war stories · design-system     │
│                  package · Swift Testing strategy · simulator MCP · buildable skeleton  │
│  nuxt-web    🔜  kotlin-android 🔜  vapor-api 🔜  …                                      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Pick a platform we don't cover yet? AppForge asks for confirmation and installs the
universal core alone — Claude still gets the architecture, the delivery method, the
memory system and the PO flow, and establishes the stack's build loop itself.

## What `/kickoff` does

1. **Interview** — the `/product-owner` skill asks one focused round of questions.
2. **PRD** — a lean one-pager (domain glossary, epics/stories) you approve.
3. **Slice plan** — vertical, always-shippable slices you approve (last blocking step).
4. **Autonomous build** — per slice: Core + tests → DataLayer → UI bricks → screens →
   full build → **eyes-on proof** (simulator screenshot / browser / curl) → memory update.
   It only stops for genuine ambiguity, paid dependencies, or actions only you can do.

Works standalone; detects and uses [BMAD](https://github.com/bmad-code-org/BMAD-METHOD)
if installed.

## Why it works so well with AI agents

- **Fast ground truth** — every layer builds/tests alone in seconds, no full-app builds
  to find a typo.
- **Grep-visible boundaries** — UI imports in the domain layer or hardcoded colors are
  caught by one-line searches.
- **Gotchas are pre-paid** — the platform packs ship the production war stories
  (CloudKit share acceptance landing on the scene delegate, empty-list record fields,
  schema deploys before TestFlight…) as symptom → cause → fix.
- **Memory across sessions** — session #20 doesn't re-discover or contradict session #3.

## The swift-ios pack (first pack)

`docs-architecture/` — 7 dense guides extracted & verified from production code:
ARCHITECTURE (SPM layering) · CONVENTIONS (Swift 6.2 strict concurrency, VVM-I) ·
NAVIGATION (root gating, routers, scene-delegate traps) · CLOUDKIT_GUIDE (full CKShare
lifecycle + 13 production gotchas) · DESIGN_SYSTEM (token package) · TESTING
(Swift Testing, deterministic engines) · WORKFLOW (agent build loops).

Plus a skeleton that **builds and passes tests from minute zero**:
three SPM packages (`MyAppDS`, `MyAppCore`, `DataLayer`), an XcodeGen manifest, and a
running SwiftUI app shell. Requirements: Xcode 26+, `brew install xcodegen`.

## Adding a platform pack

A pack is just a folder in `templates/packs/<id>/` with a `pack.json` manifest plus the
bricks it contributes: docs, skeleton, MCP servers, memory overrides. PRs welcome —
extract YOUR production war stories into a pack.

## Philosophy

- **MVP first** — working vertical slices over perfect horizontal layers.
- **Proof over claims** — nothing is "done" without green tests, a green build, and a
  proof someone actually looked at.
- **Knowledge compounds** — every gotcha written down: symptom → cause → fix.

## License

MIT — with a **template output exception**: everything `app-forge` generates into your
project is 100% yours. No attribution, no obligations. (See LICENSE.)
