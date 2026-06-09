---
name: kickoff
description: Turn a product idea into a built, running app — you are the team lead. Orchestrate the product-owner skill for the PRD, plan vertical slices, then build autonomously slice by slice with full validation. Use when the project is empty, when the user describes an app idea, or says "kickoff", "start the project", "build my idea".
---

# Kickoff — idea → running app (you are the team lead)

You own the whole delivery: product, architecture, code, validation. Earn that trust:
follow every gate below. Do not skip phases. Do not start coding before Phase 3 is approved.

## Phase 0 — Context
1. Read `CLAUDE.md`, `docs-architecture/ARCHITECTURE_PRINCIPLES.md` and `docs-architecture/DELIVERY.md`.
2. Read the **platform pack docs** in `docs-architecture/` (conventions, build commands, platform gotchas).
   - **No platform pack installed?** Establish the stack's build/test/run loop yourself (verify the
     commands actually work), write it to `.claude/memory/COMMANDS.md`, and tell the user best-practice
     coverage is reduced for this stack.
3. Read `.claude/memory/*.md` — if a PRD/slice plan already exists, resume instead of restarting.
4. Verify tooling: MCP servers from `.mcp.json` respond (docs lookup, simulator/emulator control where
   relevant). Missing tool → tell the user the one-line fix now, don't discover it mid-build.

## Phase 1–2 — Product (delegate to the PO)
Run the **`product-owner` skill**: one focused interview → `docs/PRD.md` (lean, ≤150 lines, with
domain glossary + epics/stories) → explicit user OK. If a full BMAD install is present, you may use
its PM/PO workflows instead. You stay team lead: challenge the PO output if the domain glossary
doesn't map cleanly onto the layer model.

## Phase 3 — Slice plan
Map the PRD onto the layers (`ARCHITECTURE_PRINCIPLES.md`) and write `docs/SLICES.md`:
- **Slice 0 — skeleton runs**: app boots empty on the target (simulator/emulator/browser/server). Proof required.
- **Slice 1 — domain heart**: core entities + main engine fully tested + the ONE main screen on InMemory data.
- **Slice 2+**: one vertical feature each (persistence/cloud, screens, gamification, sharing…), always end-to-end, always shippable.
Each slice lists: goal, files per layer, test plan, demo criterion ("what the user sees").
Show the plan; get explicit OK. **This is the last blocking approval.**

## Phase 4 — Autonomous build loop (per slice)
Follow `DELIVERY.md` §"The build loop" exactly, with the platform pack's commands:
1. Core: models/engines + tests → layer tests green.
2. DataLayer: interface + InMemory impl (real backend only when the slice demands it — follow the
   platform pack's backend guide and its gotchas religiously).
3. Module: reusable UI bricks (design tokens only, callbacks as boundaries).
4. App: screen assembly, store wiring, navigation per the pack's navigation doc.
5. Full app build; fix until green.
6. **Eyes-on proof**: run it (simulator MCP / browser / curl), navigate to the feature, capture and
   actually inspect the proof (layout, dark mode, empty states, error states).
7. Memory update: `PROJECT_STATE.md` (done/todo/gotchas) + `DECISIONS.md` for any choice a future
   session must not re-litigate.
8. Report the slice with its proof, then continue to the next slice.

Stop and ask ONLY when: a slice's scope is genuinely ambiguous, a paid/external dependency appears,
or the user must act (store consoles, certificates, cloud dashboard schema deploys, real-device tests).

## Quality bars (every slice)
- Layer tests green BEFORE app build. New domain rule ⇒ new test, same change.
- Zero hardcoded visual values; zero UI/IO framework imports in Core; dependency arrows point one way.
- Honest reporting: failures shown with output, not narrated away.
