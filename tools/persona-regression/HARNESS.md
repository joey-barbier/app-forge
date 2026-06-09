# SIMULATION HARNESS

You (the simulation agent) play a **full Claude Code session AND its user**:

- **[CLAUDE] turns**: follow the generated project's `CLAUDE.md`,
  `docs-architecture/` and `.claude/skills/` EXACTLY (the kickoff skill drives
  the flow). You are a faithful Claude Code: gates are blocking,
  proof-over-claims applies.
- **[USER:persona] turns**: stay STRICTLY in character (knowledge limits are in
  the persona brief). The persona answers interviews, gives OKs, reacts. Never
  let Claude-knowledge leak into persona answers.
- Write the full dialogue as it happens into `<project>/SESSION.md`
  (`[USER]`/`[CLAUDE]` alternating, tool work summarized in brackets).

## Scope (hard limits — budget)

1. **Scaffold via CLI**: run
   `node <FORGE>/bin/cli.js init <AppName> --platform swift-ios --id com.test.<lowercase>`
   inside `/tmp/persona-<id>/` (create the dir first). `<FORGE>` is the
   boilerplate repo root.
2. **Kickoff Phase 0 → 3**: context, interview (persona answers), PRD, slice
   plan, **both gates** (persona approves).
3. **Build slice 0 + slice 1 ONLY**, even if the plan has more. Keep slice 1
   minimal: ≤3 domain types, 1 engine, tests, 1 main screen on InMemory data.
4. **Real proofs** (see degraded-proof rules below): RUN the builds and tests
   for real, paste actual results in `SESSION.md`.
5. **Update memory files** as the skills prescribe; stop after slice 1 with a
   final [CLAUDE] report to the persona.

Your final message = the report schema summary (the artifacts + `SESSION.md`
are the deliverable).

## Degraded-Proof Rules (host constraints)

This harness runs on a host where **xcodegen is NOT installed and there is no
simulator access**. Therefore:

- **Slice 0 proof** = all 3 packages build via `swift build`.
- **Slice 1 proof** = `swift test` green on the Core package.
- RUN them for real; paste the command output into `SESSION.md`. Claims without
  pasted output count as no proof.
- Note **honestly** in `SESSION.md` that app-target/simulator proof was out of
  harness scope. Never fake or imply a simulator run.

## Simulation Report Schema

Each simulation ends with a structured report containing:

| Field | Type | Meaning |
|---|---|---|
| `persona` | string | persona label |
| `projectDir` | string | absolute path to the generated project |
| `prdBeforeCode` | boolean | PRD approved before ANY code was written |
| `gatesRespected` | boolean | no code before slice-plan OK |
| `sliceReached` | string | last slice completed |
| `coreTestsGreen` | boolean | `swift test` green on Core |
| `packagesBuild` | boolean | all 3 packages `swift build` OK |
| `frictionPoints` | string[] | every moment the persona was confused, blocked, or annoyed |
| `personaVerdict` | string | in the persona voice: would they continue using this? |
