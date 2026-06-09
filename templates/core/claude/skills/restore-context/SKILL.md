---
name: restore-context
description: Restore project context from memory files at session start or after losing the thread. Use on the first message of any session, or on "where were we", "resume", "catch up", "refresh context".
---

# Restore context (anti-hallucination)

1. Read, in order: `.claude/memory/PROJECT_STATE.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `NEXT_STEPS.md`, `COMMANDS.md`.
2. Cross-check the 2–3 most load-bearing claims against the code (file exists? API matches?). **Code wins** over memory; fix stale memory immediately.
3. Summarize back in ≤ 10 lines: current slice, last completed work, next step, open gotchas.
4. If memory files are missing or empty: say so, offer to initialize them from a project scan — never invent history.

Rules:
- NEVER assert a project fact that is not in memory or verifiable in code.
- A memory file naming a function/flag that no longer exists = update the file, then proceed.
