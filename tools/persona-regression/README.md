# Persona Regression Harness

Re-runnable validation that the boilerplate **works for every user profile,
continuously** — not just for its owner. Three simulated personas (a
non-technical PO, a skeptical senior dev, a speed-focused AI expert) each use
the boilerplate end-to-end on a small invented project; independent auditors
verify the artifacts; a cross-persona synthesis gives the final verdict.

## Contents

| File | Purpose |
|---|---|
| `personas/marie.md` | Non-technical PO — plain-language + recommended-defaults checks |
| `personas/karim.md` | Skeptical senior iOS dev — architecture-challenge + deviation checks |
| `personas/sasha.md` | Speed-focused AI expert — zero-redundancy + fast-gates checks |
| `HARNESS.md` | Simulation protocol + report schema + degraded-proof rules |
| `AUDIT_RUBRIC.md` | 5 audit dimensions /10 + auditor protocol |

Adding a persona = adding one `personas/<id>.md` file (same structure as the
existing three). The run snippet picks it up automatically.

## When to Run

- **Before any release** of the boilerplate.
- **After any change to the skills or docs** shipped in the generated projects
  (kickoff skill, product-owner skill, `CLAUDE.md`, `docs-architecture/`).
- After CLI/template changes that affect the scaffold output.

A run takes the three simulations + three audits + one synthesis; budget
accordingly (each sim scaffolds a real project in `/tmp` and runs real
`swift build` / `swift test`).

## How to Run

Paste this as a Claude Code workflow script (it is a condensed version of the
original validation workflow, parameterized on the files in this directory):

```js
export const meta = {
  name: 'persona-regression',
  description: 'Personas defined in tools/persona-regression use the boilerplate end-to-end; independent audits; cross-synthesis verdict',
  phases: [
    { title: 'Simulate', detail: 'per-persona session: init → kickoff → PRD → slices → slice 0+1 build' },
    { title: 'Validate', detail: 'per-persona audit of artifacts + cross-persona synthesis' },
  ],
}

import { readFileSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'

const FORGE = '<path-to-your-app-forge-checkout>' // boilerplate repo root — adjust if needed
const REG = join(FORGE, 'tools', 'persona-regression')
const HARNESS = readFileSync(join(REG, 'HARNESS.md'), 'utf8').replaceAll('<FORGE>', FORGE)
const RUBRIC = readFileSync(join(REG, 'AUDIT_RUBRIC.md'), 'utf8')
const PERSONAS = readdirSync(join(REG, 'personas'))
  .filter(f => f.endsWith('.md'))
  .map(f => ({ id: basename(f, '.md'), brief: readFileSync(join(REG, 'personas', f), 'utf8') }))

const SIM_REPORT = {
  type: 'object', additionalProperties: false,
  required: ['persona', 'projectDir', 'prdBeforeCode', 'gatesRespected', 'sliceReached', 'coreTestsGreen', 'packagesBuild', 'frictionPoints', 'personaVerdict'],
  properties: {
    persona: { type: 'string' },
    projectDir: { type: 'string' },
    prdBeforeCode: { type: 'boolean' },
    gatesRespected: { type: 'boolean', description: 'no code before slice-plan OK' },
    sliceReached: { type: 'string' },
    coreTestsGreen: { type: 'boolean' },
    packagesBuild: { type: 'boolean' },
    frictionPoints: { type: 'array', items: { type: 'string' }, description: 'every moment the persona was confused, blocked, or annoyed' },
    personaVerdict: { type: 'string', description: 'in the persona voice: would they continue using this?' },
  },
}

phase('Simulate')
const sims = await parallel(PERSONAS.map(p => () =>
  agent(`${p.brief}\n${HARNESS}`, { label: `sim:${p.id}`, phase: 'Simulate', schema: SIM_REPORT })
)).then(r => r.filter(Boolean))
log(`${sims.length}/${PERSONAS.length} simulations done`)

phase('Validate')
const VALIDATION = {
  type: 'object', additionalProperties: false,
  required: ['persona', 'scores', 'evidence', 'failures', 'verdict'],
  properties: {
    persona: { type: 'string' },
    scores: { type: 'object', additionalProperties: false, required: ['prdDiscipline', 'interviewFit', 'architectureCompliance', 'testsAndProof', 'usability'], properties: {
      prdDiscipline: { type: 'number' }, interviewFit: { type: 'number' }, architectureCompliance: { type: 'number' }, testsAndProof: { type: 'number' }, usability: { type: 'number' } } },
    evidence: { type: 'array', items: { type: 'string' }, description: 'file:line / command output backing each score' },
    failures: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string', description: 'pass | pass-with-fixes | fail, one line why' },
  },
}
const validations = await parallel(sims.map(s => () =>
  agent(`You are an independent AUDITOR. A persona simulation just used the boilerplate end-to-end.
Sim self-report: ${JSON.stringify(s)}
Apply this rubric and protocol to the letter — rerun proofs yourself, do not trust the self-report or SESSION.md:
${RUBRIC}`,
    { label: `audit:${s.persona.split(' ')[0].toLowerCase()}`, phase: 'Validate', schema: VALIDATION })
)).then(r => r.filter(Boolean))

const SYNTHESIS = {
  type: 'object', additionalProperties: false,
  required: ['worksForAll', 'perPersona', 'boilerplateFixes', 'overall'],
  properties: {
    worksForAll: { type: 'boolean' },
    perPersona: { type: 'array', items: { type: 'string' }, description: 'one line per persona: verdict + the one thing that mattered' },
    boilerplateFixes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['what', 'where', 'severity'], properties: {
      what: { type: 'string' }, where: { type: 'string', description: 'CLI | CLAUDE.md | kickoff skill | product-owner skill | docs | pack' }, severity: { type: 'string', description: 'blocker | major | minor' } } } },
    overall: { type: 'string', description: '5-10 honest lines for the boilerplate owner' },
  },
}
const synthesis = await agent(`Cross-persona synthesis for the boilerplate. ${PERSONAS.length} personas each used it end-to-end; independent audits followed.
Sims: ${JSON.stringify(sims)}
Audits: ${JSON.stringify(validations)}
Answer: does the boilerplate work for ALL profiles (the owner's explicit requirement: it must not be tuned for a single person) — or is it tuned for one? Derive the concrete fix list (what/where/severity) from the actual friction points and failures, deduplicated and prioritized. Be honest: if a persona would have abandoned, say so.`,
  { label: 'synthesis', phase: 'Validate', schema: SYNTHESIS })

export default { sims, validations, synthesis }
```

## How to Read the Synthesis

The run returns `{ sims, validations, synthesis }`. Read in this order:

1. **`synthesis.worksForAll`** — the single boolean that matters. `true` means
   every profile got through kickoff → slice 1 with real proofs and would
   continue on their own. `false` means the boilerplate is tuned for one
   profile: check `perPersona` for who it failed.
2. **`synthesis.boilerplateFixes`** — the prioritized fix list. Each entry has
   `what` (the fix), `where` (CLI | CLAUDE.md | kickoff skill | product-owner
   skill | docs | pack) and `severity`:
   - `blocker` — fix before any release; a persona abandoned or proofs failed.
   - `major` — fix soon; significant friction or a rubric dimension ≤ 5/10.
   - `minor` — backlog.
3. **`synthesis.perPersona` + `validations[*].verdict`** — one line per persona
   and the audited scores. A polished transcript with a `fail` audit verdict
   means the simulation lied: trust the audit, not the sim.
4. **`sims[*].frictionPoints`** — the raw material for UX fixes even when
   everything passes.

Regression rule of thumb: a release is good when `worksForAll === true` and no
`blocker`/`major` fixes remain open.
