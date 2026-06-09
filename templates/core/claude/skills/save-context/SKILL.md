---
name: save-context
description: Persist session progress into the project memory files. Use after completing a slice or significant work, before ending a session, or on "save progress", "checkpoint", "update memory".
---

# Save context

## Workflow
1. **Inventory the session**: list what was built, what was decided (and why), what broke and how
   it was fixed, what's now blocked. If the session contradicts an existing memory entry, that's a
   decision change → record the new choice in `DECISIONS.md` (dated), don't silently overwrite.
2. **Map each item to its file** using the table below. One fact, one home — no duplication.
3. **Apply surgical edits, then verify integrity**: re-read your diff — no pre-existing fact, date
   or gotcha may disappear. Updating an entry in place is fine; losing its date is not.

| File | Write here |
|---|---|
| `PROJECT_STATE.md` | What changed this session (done ✅ / in-progress 🚧 / todo), new gotchas with symptom→cause→fix, current slice status. Most important file — keep it ≤ 300 lines, prune stale entries. |
| `DECISIONS.md` | Choices a future session must not re-litigate ("we chose X over Y because Z"). One line each, dated. |
| `NEXT_STEPS.md` | Reordered priorities, new blockers, launch checklist deltas. |
| `ARCHITECTURE.md` | Only if the structure itself changed (new package, new layer rule). |
| `COMMANDS.md` | Only when a new command proved useful (with the exact working flags). |

**Example — a gotcha entry** (PROJECT_STATE.md, gotchas log):
```markdown
- **Records failed to save: "cannot use an empty list to initialize a new field (tags)"**
  → backend rejects empty arrays on list fields → omit the field when the array is empty. Fixed 2026-06-09.
```

## Rules
- Facts only — no narration, no praise. Convert relative dates to absolute (2026-06-09, not "today").
- Gotchas are the most valuable entries: always symptom → cause → fix.
- **Integrity**: never delete or rewrite pre-existing facts/dates; append or update in place.
- Never log secrets, tokens, or personal data.
- Finish with a one-line confirmation listing the files you touched.
