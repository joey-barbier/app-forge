# AUDIT RUBRIC

Independent per-persona audit of a finished simulation. The auditor is NOT the
simulator and **does not trust the self-report**.

## The 5 Dimensions (each scored /10)

| Dimension | /10 means |
|---|---|
| `prdDiscipline` | PRD + slices approved before ANY code |
| `interviewFit` | questions adapted to THIS persona (plain words for the non-technical PO, precise for the senior dev, near-zero redundancy for the expert) |
| `architectureCompliance` | the boilerplate's layer model (L0–L5) respected in generated code — verify imports, design-system tokens, contracts |
| `testsAndProof` | tests exist + actually green (rerun them), honest proof reporting |
| `usability` | could THIS persona continue alone (commands, memory files, clarity) |

Every score must be backed by `evidence` (file:line references or pasted
command output). Unverifiable claims score 0 on that dimension.

## Auditor Protocol

AUDIT for real — do not trust the self-report:

1. **Read `<projectDir>/SESSION.md` fully** — check the dialogue: PRD before
   code? Gates blocking? Questions fit the persona (re-read the persona brief)?
2. **Inspect the generated code**:
   - grep for SwiftUI imports in the Core package (must be **none**);
   - grep for hardcoded colors/fonts in screens (must be **none** — design-system
     tokens only);
   - verify the repository contract + InMemory implementation pattern;
   - one type per file.
3. **RERUN the proofs yourself**: `swift build` on the 3 packages, `swift test`
   on Core. Paste real results. SESSION.md transcripts are claims, not proof.
4. **Check memory files** were updated (PROJECT_STATE / DECISIONS) and reflect
   reality — including any consciously recorded deviation.
5. **Score the 5 dimensions /10 with evidence**; list every failure.

**Be the antagonist: a polished SESSION.md with broken code = fail.**

## Audit Report Schema

| Field | Type | Meaning |
|---|---|---|
| `persona` | string | persona label |
| `scores` | object | the 5 dimensions above, each a number /10 |
| `evidence` | string[] | file:line / command output backing each score |
| `failures` | string[] | every failure found |
| `verdict` | string | `pass` \| `pass-with-fixes` \| `fail`, one line why |
