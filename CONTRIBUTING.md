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

- **Dotfile storage**: templates store dotfiles un-dotted and the CLI re-dots them on
  scaffold. The rename map (`bin/cli.js`) is the source of truth — keep this list in sync
  with it: `claude/` → `.claude/`, `mcp.json` → `.mcp.json`, `gitignore` → `.gitignore`,
  `github/` → `.github/`. Why un-dotted: npm's publish pipeline drops a package's own
  `.gitignore` from the tarball, so that file *must* ship un-dotted; the rest are un-dotted
  for one uniform rule and so the template copies never act as live config inside this repo.
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

`pack.json` — six required keys (+ optional `idDefault`):

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

Gates 1, 3 and 4 are enforced by CI (`.github/workflows/ci.yml`); gate 2 is a reviewer
heuristic, not a check. Self-check all of them first. `Throwaway/` and `Test*/` are
git-ignored at the repo root, so a scratch scaffold never gets committed by accident.

1. **The skeleton builds and passes ≥ 1 real test.** Scaffold a throwaway project and
   run the pack's own loop:

   ```bash
   node bin/cli.js init Throwaway --platform <pack-id> --id com.example.throwaway
   # then run the exact commands from your claude/memory/COMMANDS.md
   ```

   Paste the **actual build + test output** in the PR description. Proof over claims —
   a PR that says "it builds" without output will be sent back.
2. **Docs sized to fit Claude's context — a reviewer heuristic, not a CI check.** Aim
   for ~100–250 lines per *pack* doc: under ~100 the war stories are probably missing,
   over ~250 Claude starts dropping rules — split by domain instead. This is a target,
   not a gate: some docs justifiably sit outside the band (the universal-core docs are
   deliberately terse — `DELIVERY.md` is ~70 lines — and a dense single-domain guide can
   run past 250). Justify the outliers in review rather than padding or over-splitting.
3. **No leakage.** Run the same gate CI runs (it scans tracked files — `git add` first):

   ```bash
   bash .github/scripts/leakage-check.sh
   ```

   The gate matches the known names at word boundaries (so it won't flag benign English
   like "workaround") and prints `file:line:match` for every hit. It only knows the
   strings we already know about, so also grep for *your* app/company/product names — and
   if one of yours collides with a common English word, match its identifier forms (the
   capitalised/UPPER form a leaked module or type would take, not the lowercase prose
   word) the way the gate does, so you don't drown in false positives.
4. **Templates sanity** — placeholders limited to the supported set (in contents and
   paths), every `pack.json` parses with its required keys:

   ```bash
   bash .github/scripts/templates-sanity.sh
   ```

## Review process

1. Open a PR titled `add(pack) - <pack-id>` (or `update(pack) - <scope>`) with the
   proof output in the description.
2. CI must be green. The current jobs are `leakage`, `scaffold-core`, `scaffold-swift`,
   `scaffold-vapor`, `scaffold-nuxt`, `scaffold-ts-sdk`, and `templates-sanity` — one
   `scaffold-<pack-id>` job per shipped pack. A new pack must add its own, mirroring an
   existing scaffold job: scaffold a project, assert no leftover placeholders, then build
   + test its skeleton on the right runner (macOS for swift, ubuntu + Node 20 for JS/TS).
   README marks a pack ✅ only once its scaffold job is green.
3. Maintainer review asks one question of every doc line: *would Claude, with zero
   context about your app, do the right thing because of this line?* Expect requests
   to cut content — packs earn lines, they do not start with them.
4. A maintainer squash-merges once CI and review pass.

Bug reports and small fixes follow the same flow, no pack required — a failing test or
a scaffold command that reproduces the issue beats a paragraph describing it.
