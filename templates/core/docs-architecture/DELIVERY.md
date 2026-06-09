# Delivery Method — vertical slices, proof over claims (platform-agnostic)

How work ships, regardless of stack. The platform pack's WORKFLOW.md adds the concrete
build/run commands; this file is the method.

## Vertical slices

Never build horizontally ("all the models, then all the screens"). Ship **vertical slices**:
thin end-to-end features that a user can see working.

- **Slice 0 — skeleton runs**: empty app boots on the target (simulator/emulator/browser/server
  responds). Proof: screenshot or curl output.
- **Slice 1 — domain heart**: core entities + the main engine, exhaustively tested, plus the ONE
  main screen reading from InMemory data. Proof: tests green + screenshot.
- **Slice N**: one feature each, always end-to-end (L3 logic → L2 data → L3/L4 UI bricks → L5
  screen), always leaving the app shippable.

Each slice gets a short blueprint before code: goal, files per layer, test plan, demo criterion
("what the user sees"). Blueprints live in `docs/`.

## The build loop (per slice)

1. **L3 Core Logic first**: models/engines + contracts + their tests. Layer tests green before moving on.
2. **L2 Data**: InMemory impl of the contracts (real backend impl only when the slice demands it).
3. **L3 Core UI / L4 bricks**: reusable components — L0 tokens only, callbacks as boundaries.
4. **L5 Feature**: assemble screen + state + navigation.
5. **Full build** of the app target; fix until green.
6. **Eyes-on validation**: run it, navigate to the feature, capture proof (screenshot/recording/
   response), and actually inspect it — layout, empty states, error states.
7. **Memory update**: PROJECT_STATE.md (done/todo/gotchas), DECISIONS.md if a choice was made.

## Validation etiquette (the trust contract)

- **Executed-output only**: any value presented as produced by the code (durations, counts, demo
  strings) must come from actually executed output. Didn't run it? Label it an estimate.
- **Commit at every gate and slice completion** (`add/update/fix(scope) - description`). Gate
  discipline must be provable from git history — two delivered slices sitting untracked on main
  is an audit failure.

- **Never claim done without proof.** Tests green + build green + visual/behavioral proof.
- **Failures are reported with output**, not narrated away. A skipped step is stated as skipped.
- **Layer tests before app builds** — they're orders of magnitude faster and more precise.
- **Every new domain rule ships with its test in the same change.** No test, no rule.
- **Gotchas get written down** the moment they're solved: symptom → cause → fix, in
  PROJECT_STATE.md. The next session must not pay for them again.

## Memory protocol

`.claude/memory/` is the project's long-term brain:

| File | Contains |
|---|---|
| PROJECT_STATE.md | Current slice, done/in-progress/todo, gotchas log, launch blockers |
| ARCHITECTURE.md | How THIS project instantiates the layers; deviations + why |
| DECISIONS.md | Dated one-liners a future session must not re-litigate |
| NEXT_STEPS.md | Ordered backlog, blockers waiting on the user |
| COMMANDS.md | Commands proven to work here, exact flags |

Restore at session start; save after significant work. On conflict, **code wins over memory** —
then fix the memory file.

## When to stop and ask the user

Only for: genuine scope ambiguity, paid/external dependencies, irreversible actions
(deleting data, publishing), or actions only they can perform (store consoles, certificates,
real-device tests). Everything else: decide, note it in DECISIONS.md, keep moving.
