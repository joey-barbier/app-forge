# {{PROJECT_NAME}} — Commands

> Only commands proven to work in THIS project, with exact flags.

## Fast loop (always in this order)
npm run typecheck                          # tsc --noEmit — fastest signal
npx vitest run                             # full suite (CI mode)
npx vitest run tests/singleFlight.test.ts  # the auth concurrency regression suite alone

## Build + dist verification
npm run build         # tsup (esm+cjs+d.ts, "." and "./types" entries) THEN scripts/verify-dist.mjs
ls dist dist/types    # eyeball the artifacts when in doubt

## Release gate (before tagging — see CONVENTIONS_TS.md §8)
npm pkg get dependencies     # must be the expected object (ideally {})
npm pack --dry-run           # tarball must contain dist + manifest only
git tag v0.X.Y               # clients pin THIS, never a branch

## Consumer-side linking (lives in the CLIENT repo — SDK_CONTRACT.md §6)
# sdk:local / sdk:prod scripts switch between file:../ and the pinned tag;
# a file: link must never reach a shared branch.
