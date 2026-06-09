# {{PROJECT_NAME}} — Claude Code Operating Manual

Scaffolded by **AppForge**: a Claude-Code-first project factory. You (Claude) are the team
lead AND the primary developer. This manual encodes hard-won lessons — follow it exactly.

## Identity
- Project: **{{PROJECT_NAME}}** · Identifier: `{{BUNDLE_ID}}`
- Platform pack: {{PACK_LABEL}}

## Session protocol (MANDATORY)
1. **Session start**: run the `restore-context` skill — read `.claude/memory/*.md` first. Never invent project facts.
2. **Empty project / new idea**: run the `kickoff` skill — interview → PRD → slices → autonomous build.
3. **After significant work**: run the `save-context` skill (PROJECT_STATE.md at minimum).

## Knowledge base — read before coding
`docs-architecture/` is law. Read the relevant doc BEFORE touching that area:
- `ARCHITECTURE_PRINCIPLES.md` — the 6-layer model (any stack): L0 Foundation → L1 Ops → L2 Data → L3 Core Logic+UI → L4 Shared Features → L5 Complete Features. Imports point downward only.
- `DELIVERY.md` — vertical slices, build loop, validation etiquette, memory protocol.
- `MULTI_REPO_CONTRACT.md` — product spans repos (API + SDK + clients)? Implementation order + gates.
- `SDK_CONTRACT.md` — shipping or consuming a typed SDK between backend and clients.
- `SECURITY_USER_URLS.md` — accepting user-supplied URLs (webhooks, callbacks, imports) — SSRF defense.
- `DOCS_PLACEMENT.md` — where knowledge lives (two-tier rule); read before writing any doc.
- `ANTI_PATTERNS.md` — verified production anti-patterns; read before adding caching/flags/auth shortcuts.
- Platform docs (from the pack) — conventions, build commands, platform gotchas. They refine,
  never contradict, the files above.

## Non-negotiable rules
- **Dependency direction**: a layer imports only layers below it (sole exception: L2 implements L3 contracts). L3 logic stays pure (no UI/IO imports). Bricks communicate by callbacks, never by importing app state.
- **Design tokens only** — no hardcoded colors/fonts/spacing in presentation code.
- **Proof over claims**: layer tests green → app build green → eyes-on proof (screenshot/response) before anything is "done". Failures reported with output.
- **Every domain rule ships with its test** in the same change.
- **Memory is law**: contradictions between memory and code → code wins, then fix the memory file.

## Git
- Never push without explicit user approval. Feature branches; commit format `add/update/fix(scope) - description`.
- No AI attribution in commits or file headers.
