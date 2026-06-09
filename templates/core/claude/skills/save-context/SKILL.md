---
name: save-context
description: Persist session progress into the project memory files. Use after completing a slice or significant work, before ending a session, or on "save progress", "checkpoint", "update memory".
---

# Save context

Update `.claude/memory/` — surgical edits, not rewrites:

| File | Write here |
|---|---|
| `PROJECT_STATE.md` | What changed this session (done ✅ / in-progress 🚧 / todo), new gotchas with symptom→cause→fix, current slice status. Most important file — keep it ≤ 300 lines, prune stale entries. |
| `DECISIONS.md` | Choices a future session must not re-litigate ("we chose X over Y because Z"). One line each, dated. |
| `NEXT_STEPS.md` | Reordered priorities, new blockers, launch checklist deltas. |
| `ARCHITECTURE.md` | Only if the structure itself changed (new package, new layer rule). |
| `COMMANDS.md` | Only when a new command proved useful (with the exact working flags). |

Rules:
- Facts only — no narration, no praise. Convert relative dates to absolute (2026-06-08, not "today").
- Gotchas are the most valuable entries: always symptom → cause → fix.
- Never log secrets, tokens, or personal data.
