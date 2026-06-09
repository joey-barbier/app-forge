# {{PROJECT_NAME}} — Claude Code Operating Manual

This project was scaffolded by **AppForge** (pack: TypeScript SDK): a Claude-Code-first
architecture extracted from production SDKs. You (Claude) are the team lead AND the
primary developer. Follow this manual exactly — it encodes hard-won lessons, not preferences.

## Identity
- Package: **`{{BUNDLE_ID}}`** ({{PROJECT_NAME}}) · TypeScript, strict · Node 20+ / evergreen browsers
- This is a **typed SDK**: the single client library between an API and all of its consumers
  (web, SSR, CLI, CI…).

## Multi-repo position — this repo is the CONTRACT layer
The product spans repos: `backend → SDK (this repo) → clients`. Everything here follows
`docs-architecture/MULTI_REPO_CONTRACT.md`:
- **Backend changes land here second** — never start SDK work against a backend whose tests
  are red; never let clients start before this SDK builds, type-checks, tests green and is
  **tagged**.
- **Clients consume tagged releases only** (`#vX.Y.Z` or a registry pin) — never a branch.
- **Breaking change ⇒ MIGRATION.md entry + version bump + tag**, in the same change.
- The public surface is the `exports` map. Anything not exported does not exist.

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
| coordinate with the backend or a client repo | `MULTI_REPO_CONTRACT.md` |
| anything SDK-shaped (this whole repo) | `SDK_CONTRACT.md` — this pack instantiates it |
| add/move any file, add a resource client | `ARCHITECTURE.md` |
| write any TypeScript code | `CONVENTIONS_TS.md` |
| accept user-supplied URLs (webhooks…) | `SECURITY_USER_URLS.md` |
| write any documentation | `DOCS_PLACEMENT.md` |
| add caching/feature flags/auth shortcuts | `ANTI_PATTERNS.md` |

Layer summary (universal contract in ARCHITECTURE_PRINCIPLES.md, TS mapping in ARCHITECTURE.md):
L0 `src/types/` + `src/errors/` (wire types, ApiError — import nothing above) · L1 logger port ·
L2 `src/core/` (fetch transport, storage adapters) · L3 `src/clients/` (resource clients +
single-flight auth use case) · L5 `src/index.ts` (composition root, sole public surface).
From the consumer's seat, this whole package is **their L2 Data brick**.

## Non-negotiable rules
- **Never claim done without proof**: `npm run typecheck` + `npx vitest run` + `npm run build`
  (which runs the dist/types verification) all green, outputs shown.
- **The single-flight tests are the spec.** `tests/singleFlight.test.ts` must never be
  weakened or skipped — the concurrency bug it pins reappears every time someone
  "simplifies" the auth use case.
- **Zero `console.*` in `src/`** — logging goes through the injected `SDKLogger` port,
  debug-gated, and never logs token values.
- **`.ts` sources only** — never author `.d.ts` files in `src/` (declaration generators
  silently skip them; see SDK_CONTRACT.md §4). Never commit `dist/`.
- **`dependencies` stays `{}`** unless a DECISIONS.md entry justifies a runtime dep.
  Build tooling lives in `devDependencies`, always.
- **Tagged releases only**; every breaking change ships its MIGRATION.md entry.

## Build commands
```bash
npm install
npm run typecheck      # tsc --noEmit — fastest signal
npx vitest run         # full suite, includes the single-flight regression test
npm run build          # tsup (esm+cjs+d.ts) THEN scripts/verify-dist.mjs gate
```

## Git
- Never push without explicit user approval. Feature branches; commit format `add/update/fix(scope) - description`.
- No AI attribution in commits or file headers.
