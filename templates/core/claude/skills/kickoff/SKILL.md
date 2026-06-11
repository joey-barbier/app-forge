---
name: kickoff
description: Turn a product idea into a built, running app — you are the team lead. Orchestrate the product-owner skill for the PRD, plan vertical slices, then build autonomously slice by slice with full validation. Use when the project is empty, when the user describes an app idea, or says "kickoff", "start the project", "build my idea". Do NOT use for adding features or fixes to an established codebase — that's the normal delivery loop (DELIVERY.md).
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
4. **Tooling gate** — split by severity:
   - **Build/run tooling (hard STOP).** Verify the pack's **documented** requirements (read
     them from its `CLAUDE.md` / `COMMANDS.md` — there is no `pack.json` in a generated project)
     by RUNNING their commands (version checks). A missing build tool → STOP: give the one-line
     install and ask the user to run it (or approve a reduced-proof plan — if the pack provides a
     `WORKFLOW.md` / proof ladder, follow it; otherwise agree a plan and record it in
     `.claude/memory/DECISIONS.md`). Building a whole project that ends with "zero pixels ever
     seen" is not a default anyone chose.
   - **Docs/MCP servers (WARNING, not STOP).** Check that MCP servers from `.mcp.json` respond.
     A missing or non-responding **docs** MCP (e.g. context7) is a WARNING: note it, tell the
     user docs lookups are degraded, and continue. (Caveat: a bare `npx` command can fail to
     start on native Windows because npm installs a `.cmd` shim — if the docs MCP won't launch
     there, that's the likely cause; it's not a blocker.) Only build tooling earns a hard STOP.

## Phase 1–2 — Product (delegate to the PO)
Run the **`product-owner` skill**: one focused interview → `docs/PRD.md` (lean, ≤150 lines, with
domain glossary + epics/stories) → explicit user OK. If a full BMAD install is present, you may use
its PM/PO workflows instead. You stay team lead: challenge the PO output if the domain glossary
doesn't map cleanly onto the layer model.

## Phase 3 — Slice plan
Map the PRD onto the layers (`ARCHITECTURE_PRINCIPLES.md`) and write `docs/SLICES.md`:
- **Slice 0 — skeleton runs**: app boots empty on the target (simulator/emulator/browser/server). Proof required.
- **Slice 1 — domain heart**: L3 entities + main engine fully tested + the ONE main screen on InMemory data.
- **Slice 2+**: one vertical feature each (persistence/cloud, screens, gamification, sharing…), always end-to-end, always shippable.
Each slice lists: goal, files per layer, test plan, demo criterion ("what the user sees").
Demo numbers/strings in the plan are ESTIMATES until executed — label them so, and correct the
plan from real output when the slice lands (the executed-output rule applies to plans too).
Show the plan; get explicit OK. **This is the last blocking approval.**

**Gate template** (both blocking gates use this shape — short, decision-ready):
```markdown
## Gate: <PRD | Slice plan> ready for your OK
- <3–6 bullets: the essence — core loop, the 5 features / the slices and their demo criteria>
- Trade-offs made: <what was cut/parked and why>
Reply "OK" to proceed, or tell me what to change. I will NOT build before your OK.
```

## Phase 4 — Autonomous build loop (per slice)
Follow `DELIVERY.md` §"The build loop" exactly, with the platform pack's commands:
1. L3 Core Logic: models/engines/contracts + tests → layer tests green.
2. L2 Data: InMemory impl of the contracts (real backend only when the slice demands it — follow
   the platform pack's backend guide and its gotchas religiously).
3. L3 Core UI / L4 bricks: reusable components (L0 tokens only, callbacks as boundaries).
4. L5 Feature: screen assembly, store wiring, navigation per the pack's navigation doc.
5. Full app build; fix until green.
6. **Eyes-on proof**: run it (simulator MCP / browser / curl), navigate to the feature, capture and
   actually inspect the proof (layout, dark mode, empty states, error states). Full eyes-on proof
   not possible (no simulator/emulator/headless runner) → if the pack provides a degraded/reduced-proof
   ladder, climb down it; otherwise fall back to the strongest proof the stack allows (integration
   test, logs, response capture) and SAY explicitly which rung you reached.
   Any value you attribute to the code (counts, durations, demo strings) must come from executed
   output — never fabricate a demo number.
7. Memory update: `PROJECT_STATE.md` (done/todo/gotchas) + `DECISIONS.md` for any choice a future
   session must not re-litigate. **Then commit** (`add/update/fix(scope) - description`) — every
   gate and every slice leaves a commit; untracked delivered work is an audit failure.
8. Report the slice with its proof — for a non-technical owner, translate it into product terms
   ("your two requirements are now automated tests named X and Y", screenshot when possible),
   not raw test logs. Then continue to the next slice.

Stop and ask ONLY when: a slice's scope is genuinely ambiguous, a paid/external dependency appears,
or the user must act (store consoles, certificates, cloud dashboard schema deploys, real-device tests).

## Quality bars (every slice)
- Layer tests green BEFORE app build. New domain rule ⇒ new test, same change.
- Zero hardcoded visual values; zero UI/IO framework imports in Core; dependency arrows point one way.
- Honest reporting: failures shown with output, not narrated away.
