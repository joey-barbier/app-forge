---
name: restore-context
description: Restore project context from memory files at session start or after losing the thread. Use on the first message of any session, or on "where were we", "resume", "catch up", "refresh context".
---

# Restore context (anti-hallucination)

1. Read ALL 5 files: `.claude/memory/PROJECT_STATE.md`, `ARCHITECTURE.md`, `DECISIONS.md`,
   `NEXT_STEPS.md`, `COMMANDS.md` — and **name each one in your summary's first line** (a missing
   or empty file is said out loud, not skipped silently). COMMANDS.md counts: it's where the
   build loop lives.
2. Cross-check the 2–3 most load-bearing claims against the code (file exists? API matches?).
   **Code wins** over memory: fix the stale memory entries FIRST, so your summary describes the
   corrected state and mentions what was fixed.
3. Summarize in ≤ 10 lines using this shape:
   ```markdown
   Context restored (read: PROJECT_STATE, ARCHITECTURE, DECISIONS, NEXT_STEPS, COMMANDS).
   - Current slice: <n — title, status>
   - Last done: <most recent completed work>
   - Memory vs code: <"verified ✓" | "drift found + fixed: …">
   - Open gotchas/blockers: <the ones that constrain what we do next>
   - Next step: <the single next action>
   ```
4. If memory files are missing or empty: say so, offer to initialize them from a project scan —
   never invent history.

Rules:
- NEVER assert a project fact that is not in memory or verifiable in code.
- A memory file naming a function/flag that no longer exists = update the file, then proceed.
