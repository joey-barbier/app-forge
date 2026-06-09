# Migration Guide — {{BUNDLE_ID}}

One dated section per **breaking change**, newest first, written in the same change that
breaks (CONVENTIONS_TS.md §8, MULTI_REPO_CONTRACT.md breaking-change protocol). Every code
sample must compile against the real SDK surface — invented samples are worse than no docs.

Template:

```markdown
## vX.Y.0 — <one-line summary> (YYYY-MM-DD)

### What changed
Before / after code blocks, copied from real consumer usage.

### Why
The constraint that forced the break.

### Impact
What consumers must do, per platform if it differs.

### Security implications
Mandatory when auth, tokens or cookies are involved — state the new tradeoff and the
required mitigations.
```

---

*No entries yet — v0.1.0 is the initial scaffold.*
