# {{PROJECT_NAME}} — Claude Code Operating Manual

This project was scaffolded by **AppForge** (pack: iOS/Swift): a Claude-Code-first
architecture extracted from production apps. You (Claude) are the team lead AND the
primary developer. Follow this manual exactly — it encodes hard-won lessons, not preferences.

## Identity
- App: **{{PROJECT_NAME}}** · Bundle id: `{{BUNDLE_ID}}` · iOS 26+ · Swift 6.2 (strict concurrency)
- Backend: CloudKit-only by default (container `iCloud.{{BUNDLE_ID}}`) — adapt if the PRD says otherwise.

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
| add/move any file, create a feature | `ARCHITECTURE.md` |
| write any Swift code | `CONVENTIONS.md` |
| add a screen, sheet, deeplink, push routing | `NAVIGATION.md` |
| touch CloudKit, CKShare, sync, subscriptions | `CLOUDKIT_GUIDE.md` |
| style anything (colors, fonts, spacing) | `DESIGN_SYSTEM.md` |
| write or modify domain logic | `TESTING.md` |
| build, run, validate, debug on device | `WORKFLOW.md` |

Layer summary (universal contract in ARCHITECTURE_PRINCIPLES.md, Swift mapping in ARCHITECTURE.md):
L0 `{{PROJECT_NAME}}DS` tokens · L1 Ops (create when needed) · L2 `DataLayer` (implements L3 contracts) ·
L3 `{{PROJECT_NAME}}Core` (pure domain — **never imports SwiftUI**) + DS `Components/` (Core UI) ·
L4 app `Module/` (shared feature bricks) · L5 app `App/` + `Store/` + `Tools/`. Imports point downward only.

## Non-negotiable rules
- **Packages first**: `swift build`/`swift test --package-path Packages/<X>` before any `xcodebuild`. Fast, precise errors.
- **Never claim done without proof**: package tests green + app build green + (for UI) a simulator screenshot you actually looked at.
- **Design tokens only**: no hardcoded colors/fonts/spacing in app code — everything through `{{PROJECT_NAME}}DS`.
- **Pure domain logic**: engines are `nonisolated enum`s with injected `Calendar`/dates. Every rule ships with a test.
- **Logging**: `os.Logger` with `privacy: .public` interpolation (print() is invisible on device).
- **Memory is law**: contradictions between memory files and code → code wins, then fix the memory file.

## Build commands
```bash
# per-package loop (seconds)
swift build --package-path Packages/{{PROJECT_NAME}}Core
swift test  --package-path Packages/{{PROJECT_NAME}}Core

# app target (after xcodegen generate, only when packages are green)
xcodebuild -project {{PROJECT_NAME}}.xcodeproj -scheme {{PROJECT_NAME}} \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/{{PROJECT_NAME}}_dd build 2>&1 | grep -E "error:|BUILD"
```
Simulator validation: use the `ios-simulator` MCP (install_app → launch_app → screenshot → look at it).

## Git
- Never push without explicit user approval. Feature branches; commit format `add/update/fix(scope) - description`.
- No AI attribution in commits or file headers.
