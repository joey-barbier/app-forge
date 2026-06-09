# Contributing to AppForge

The highest-value contribution is a **platform pack** — the distilled experience of
shipping production apps on one stack, packaged so Claude Code can use it from day one.
This guide is the contract a pack must honor.

One rule governs everything, and it applies to the boilerplate itself: **proof over
claims**. CI builds what you scaffold, and your PR must show real command output.

`templates/packs/swift-ios/` is the canonical example. When in doubt, copy its shape.

## How packs are assembled

`bin/cli.js init` copies `templates/core/` (universal), then your pack on top of it:

| Pack file | Scaffold behavior |
|---|---|
| `pack.json` | manifest only — never copied into projects |
| `mcp.json` | **merged**: your `mcpServers` are spread into core's `.mcp.json` |
| `gitignore` | **concatenated** after core's `.gitignore` |
| everything else | **overrides** core at the same path, or is added |

Two mechanical rules:

- **Dotfile storage**: npm strips dotfiles from published packages, so templates store
  them un-dotted — `claude/` → `.claude/`, `mcp.json` → `.mcp.json`, `gitignore` → `.gitignore`.
- **Placeholders**: `{{PROJECT_NAME}}` and `{{BUNDLE_ID}}` are substituted in file
  contents **and** in file/directory names (`{{PACK_LABEL}}` is also available).
  Nothing else is substituted — any other `{{UPPER_SNAKE}}` token fails CI.

## Pack anatomy

```
templates/packs/<pack-id>/
├── pack.json                   # manifest (required — see below)
├── CLAUDE.md                   # REPLACES core CLAUDE.md (override, not merge):
│                               #   keep the session protocol + the "read this doc
│                               #   before touching that area" routing table
├── docs-architecture/          # the heart of the pack — platform knowledge base
│   ├── ARCHITECTURE.md         #   how the universal layer model maps to the stack
│   ├── CONVENTIONS.md          #   language rules (versions, idioms, strictness)
│   ├── TESTING.md              #   test strategy + the exact commands
│   └── *.md                    #   one doc per hard domain (e.g. CLOUDKIT_GUIDE.md)
├── claude/memory/COMMANDS.md   # the copy-pasteable build/test/run loop
├── mcp.json                    # platform MCP servers (merged into core's)
├── gitignore                   # platform ignores (concatenated to core's)
└── …skeleton…                  # a minimal BUILDABLE project using the placeholders,
                                #   e.g. Packages/{{PROJECT_NAME}}Core/ with ≥1 real test
```

`pack.json` — all six keys:

```jsonc
{
  "id": "swift-ios",                 // must equal the directory name (used by --platform)
  "label": "iOS app — Swift 6.2 / SwiftUI / CloudKit",  // shown in the init picker
  "languages": ["swift"],
  "idPrompt": "Bundle identifier",   // how to ask the user for the project identifier
  "requirements": ["Xcode 26+"],     // tools the USER must install — printed after init
  "notes": "Packages build day one: …"  // printed after init; {{PROJECT_NAME}} allowed
}
```

## Extraction rules — rules, not data

Packs are extracted from real production apps. Ship the **lessons**, never the app:

- **Invariants** — rules Claude must obey, stated as rules with a one-line reason:
  "Core never imports UI — it must test in seconds without a simulator."
- **War stories** — always `Symptom → Cause → Fix` (→ the rule that prevents a repeat).
  A war story without a reproducible symptom is an opinion: cut it.
- **Never include**: class names from your codebase, business/domain documentation,
  feature lists, file inventories, real identifiers, team IDs, emails, product names.
- **Genericize everything**: `SampleItem`, not `Invoice`; `{{PROJECT_NAME}}Core`, not
  your real module name.
- **English only** — these docs are Claude's context; keep them universal.
- Litmus test: if a sentence only makes sense to someone who has seen your codebase,
  it does not belong in a pack.

## Quality gates

CI (`.github/workflows/ci.yml`) and reviewers enforce all of these. Self-check first:

1. **The skeleton builds and passes ≥ 1 real test.** Scaffold a throwaway project and
   run the pack's own loop:

   ```bash
   node bin/cli.js init Throwaway --platform <pack-id> --id com.example.throwaway
   # then run the exact commands from your claude/memory/COMMANDS.md
   ```

   Paste the **actual build + test output** in the PR description. Proof over claims —
   a PR that says "it builds" without output will be sent back.
2. **Docs are 100–250 lines each.** Under ~100 lines the war stories are probably
   missing; over ~250 Claude starts dropping rules. Split by domain instead.
3. **No leakage.** Run the same gate CI runs (it scans tracked files — `git add` first):

   ```bash
   bash .github/scripts/leakage-check.sh
   ```

   Also grep for your own app/company/product names — the CI list only contains the
   strings we already know about. Mind substrings: fragments inside longer words count.
4. **Templates sanity** — placeholders limited to the supported set (in contents and
   paths), every `pack.json` parses with its required keys:

   ```bash
   bash .github/scripts/templates-sanity.sh
   ```

## Review process

1. Open a PR titled `add(pack) - <pack-id>` (or `update(pack) - <scope>`) with the
   proof output in the description.
2. CI must be green: `leakage`, `scaffold-core`, `scaffold-swift`, `templates-sanity`.
   A new pack must also add a `scaffold-<pack-id>` job to `ci.yml` mirroring
   `scaffold-swift`: scaffold a project, then build + test its skeleton on the right
   runner.
3. Maintainer review asks one question of every doc line: *would Claude, with zero
   context about your app, do the right thing because of this line?* Expect requests
   to cut content — packs earn lines, they do not start with them.
4. A maintainer squash-merges once CI and review pass.

Bug reports and small fixes follow the same flow, no pack required — a failing test or
a scaffold command that reproduces the issue beats a paragraph describing it.
