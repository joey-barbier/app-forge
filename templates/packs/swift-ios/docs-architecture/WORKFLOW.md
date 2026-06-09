# WORKFLOW — Dev Loop & AI-Agent Operating Manual

How to ship features in {{PROJECT_NAME}}. Prescriptive. Follow exactly.

## 1. Slice-Based Delivery

Ship **vertical slices**: thin end-to-end features (UI → domain → persistence), never horizontal layers across the whole app. One slice = one shippable increment validated on simulator.

**Per slice:**
1. **Blueprint first** — write the slice's blueprint as a section of `docs/SLICES.md` before any
   code (single canonical file — per-slice standalone files drift). Must contain:
   - The key architectural decision for the slice (e.g. "one CKRecordZone per Group, root record carries the CKShare") and why alternatives were rejected.
   - Phases mapped to layers, each with an explicit file list (`NEW`/`MODIFY`) and signatures.
   - A "Gotchas" section (known traps for the APIs involved).
   - A production checklist (schema deploys, entitlements, device-only validations).
2. **Implement layer by layer**, gating each phase:
   - **Phase A — Core package** (pure Swift, zero IO): domain types, engines, repository *protocols*, `InMemory*Repository`, service actors. Gate: `swift test` green.
   - **Phase B — DataLayer package** (CloudKit/IO, depends on Core): record mapping, repositories as actors. Gate: `swift test` green (mapping round-trips test offline, in memory).
   - **Phase C — Module + App**: reusable UI components in `Module/`, then screens (`View / @Observable ViewModel / struct Interactor`). Gate: `xcodebuild build` green + app launched + screens rendered from sample data.
3. **Validate on simulator** (screenshots, tapping through flows — see §3).
4. **Update memory files** (§5) before considering the slice done.

Track slice status with checkboxes in `NEXT_STEPS.md`; log what was actually built (with test counts and verification status) in `PROJECT_STATE.md`.

## 2. Build & Test Loop (agents: this exact order)

**Packages FIRST. Always.** `swift test` on a pure package takes seconds and gives precise errors; `xcodebuild` takes minutes and buries them.

```bash
# 1. Per-package, fast, no simulator needed
swift test --package-path Packages/{{PROJECT_NAME}}Core
swift test --package-path Packages/DataLayer     # CKRecord mapping tests run in memory
swift build --package-path Packages/{{PROJECT_NAME}}DS

# 2. App target — ONLY when all packages are green
xcodebuild -project "{{PROJECT_NAME}}/{{PROJECT_NAME}}.xcodeproj" -scheme {{PROJECT_NAME}} \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath /tmp/{{PROJECT_NAME}}_dd build 2>&1 | grep -E "error:|warning:.*deprecated|BUILD"

# 3. App-target tests (only for app-layer logic: stores, formatting, UI tests)
xcodebuild -project "{{PROJECT_NAME}}/{{PROJECT_NAME}}.xcodeproj" -scheme {{PROJECT_NAME}} \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' test 2>&1 | grep -E "error:|Test Suite|passed|failed"
```

- Pin `-derivedDataPath /tmp/{{PROJECT_NAME}}_dd` so the built `.app` is at a known path for install.
- Always pipe through `grep -E "error:|BUILD"` — never dump full xcodebuild output into context.
- Quote paths: a `&` or space in a directory name breaks zsh silently.
- New code that is testable without UI goes in a package, not the app target — that's the whole point of the split.

> ⚠️ **Gotcha — synced folders vs package deps:** with Xcode synchronized folders (pbxproj `objectVersion 77`), any `.swift` file added under the app folder is auto-included in the target — no pbxproj edit needed. But adding a *local package dependency* DOES require a pbxproj edit (script it, keep a `.bak`). Don't waste time editing the pbxproj for plain source files.

### Simulator install / launch / visual check

After a green build, install and drive the app via the iOS-simulator MCP tools:

1. Rebuild with `-derivedDataPath /tmp/{{PROJECT_NAME}}_dd`.
2. `install_app` with `/tmp/{{PROJECT_NAME}}_dd/Build/Products/Debug-iphonesimulator/{{PROJECT_NAME}}.app`.
3. `launch_app` with terminate-running enabled.
4. `screenshot` to verify rendering; `ui_describe_all` for element coords; `ui_tap` / `ui_type` / `ui_swipe` to drive flows end-to-end.

`screenshot` / `launch_app` / `record_video` ride on `simctl` and always work. `ui_tap` / `ui_describe_all` / `ui_find_element` require **idb**: `brew install facebook/fb/idb-companion` + `uv tool install fb-idb`, verify with `idb list-targets`.

> ⚠️ **Gotcha — stale simulator binary:** the app on the simulator can be an old build (you tap a button that "doesn't exist"). **Always reinstall the current build before visual verification.** Symptom: feature missing on screen that compiles fine. Cause: you launched yesterday's binary. Fix: rebuild → `install_app` → `launch_app`, every time.

> ⚠️ **Gotcha — SwiftUI toolbar items invisible to accessibility tooling:** navigation-bar items (back, "+") are collapsed into an unexposed "Nav bar" group, so `ui_find_element` never finds them. Tap visual coordinates instead (vertical center of the nav bar ≈ y=88 on current iPhones).

> ⚠️ **Gotcha — CloudKit account probe stalls UI tests:** `CKContainer.accountStatus` can hang ~150 s on a freshly cloned simulator, freezing app startup. Fix: a launch argument (e.g. `-uitest-mock`) that makes the store bootstrap force the in-memory backend instantly; pass it in every UITest and agent-driven launch.

## 3. Device Debugging: `os.Logger`, never `print()`

`print()` output is only visible when Xcode's debugger is attached. On a real device launched from the home screen — exactly when CloudKit, push, and share-acceptance bugs appear — `print()` goes nowhere. Use `os.Logger`:

```swift
import os

let logger = Logger(subsystem: "com.example.{{PROJECT_NAME}}", category: "Store")

logger.info("account=\(status.rawValue, privacy: .public) backend=\(backendName, privacy: .public)")
logger.error("bootstrap failed: \(error.localizedDescription, privacy: .public)")
```

- Interpolated values are `<private>` by default — add `privacy: .public` to every value you actually need to read, or the log is useless.
- Read logs in Xcode (Window → Devices, or the console while running) or Console.app filtered by subsystem. Logs persist even when the app was launched without a debugger.
- Log at every backend decision point: account status, chosen backend (cloud vs in-memory), and raw server errors.

> ⚠️ **Gotcha — bug invisible on simulator, found only via device logs:** real-device sync "silently" loaded 0 items while the simulator (in-memory fallback) looked fine. Device logs showed CloudKit error 12/2006: *"cannot use an empty list to initialize a new field"*. Cause: CloudKit (Development) infers a List field's type at first save and **rejects an empty array** — so any fresh user whose record had `unlockedIDs = []` failed its very first save. Fix: in `CKRecord` mapping, **omit list fields when empty** (reads default to `[]`; the schema field is created on the first non-empty save). Without device logging this is undiagnosable.

> ⚠️ **Gotcha — CKShare acceptance never fires in AppDelegate:** with the SwiftUI App lifecycle, `userDidAcceptCloudKitShareWith` is delivered to the **scene delegate**, not the app delegate. Provide a `SceneDelegate` via `application(_:configurationForConnecting:options:)` (`delegateClass`) and implement `windowScene(_:userDidAcceptCloudKitShareWith:)`. Log in both handlers to see which fires. Also: invite links show "you need a newer version of this app" unless Info.plist contains `CKSharingSupported = true`.

## 4. Memory System (anti-hallucination)

Persistent context lives in `.claude/memory/`. **Restore at session start** (read all five files before doing anything). **Update after every significant change** — a session whose work isn't in memory didn't happen, because the next session can't see it.

| File | Contains |
|------|----------|
| `PROJECT_STATE.md` | What the app is, stack, package list with test counts, per-slice done log, **session-by-session changelog with verification status**, gotchas discovered, known remaining issues. The priority file. |
| `ARCHITECTURE.md` | Technical structure: layers, patterns (VVM-I, actors), package dependency graph, data flow. |
| `DECISIONS.md` | Numbered table (`D1, D2, …`): decision + one-line *why*. Append-only; reference IDs (e.g. "per D11") instead of re-litigating. |
| `NEXT_STEPS.md` | Roadmap with checkboxes per slice/phase, deferred findings, tech debt with file:line pointers. |
| `COMMANDS.md` | Real, verified commands (build, test, simulator, scripts) + environment quirks. Copy-paste ready. |

Rules:
- **Never invent project facts.** If memory doesn't cover it, read the code or ask.
- Record *negative* results too ("clustering: SwiftUI `Map` still has no native API even on iOS 26 — verified against docs; hand-rolled instead"). They prevent the next session from re-exploring dead ends.
- Track unfixable-offline issues explicitly (e.g. a "needs 2 iCloud accounts / real device" list) so they aren't silently forgotten before release.

## 5. Validation Etiquette (non-negotiable)

1. **Never claim "done" without building.** "It should work" is not a status. Minimum bar: packages `swift test` green + app `xcodebuild build` green.
2. **UI changes require a screenshot.** Rebuild → reinstall → launch → screenshot (and tap through the flow for interactions). "Build succeeded" says nothing about rendering.
3. **Logic changes require tests.** New domain rules get unit tests in the owning package, including non-regression tests for every fixed bug (the empty-list fix above shipped with one).
4. **Report status honestly, in tiers:**
   - *Tested* — unit tests cover it, green.
   - *Verified on simulator* — seen working via screenshot/taps.
   - *Builds, unverified* — compiles; behavior not observed.
   - *Device-only, NOT validated* — push, share acceptance, real iCloud accounts. Say so explicitly and keep a running list; never imply these work because the simulator fallback ran.
5. **Run adversarial review before release-grade milestones.** Confirmed findings get fixed *and re-validated* (tests + build + simulator); deferred findings go to `NEXT_STEPS.md` with the reason.

> ⚠️ **Gotcha — orphaned popover after deleting its anchor:** deleting an item from its own anchored popover left the popover floating (anchor gone), blocked selecting other items, and made the deleted marker "re-pop" while panning (SwiftUI recreated the annotation to serve the anchor). Fix: the detail card dismisses itself via `@Environment(\.dismiss)` on delete, AND the map clears `selectedID` in `onChange(of: items.ids)` when the selected item disappears. Verify deletion flows by actually deleting on the simulator — this class of bug is invisible to builds and unit tests.

> ⚠️ **Gotcha — UITests welded to display copy:** UITests matching localized button text break on every rewording. Put stable `accessibilityIdentifier`s on test-critical controls (FABs, tabs, primary CTAs, markers) and match those; keep `accessibilityLabel` for VoiceOver.


## Tooling gate (run BEFORE Phase 1 of any kickoff — hard stop, not a parting note)
```bash
xcodegen --version                                   # required to generate the .xcodeproj
xcrun simctl list runtimes | grep iOS                # a runtime must match project.yml's deploymentTarget
```
Missing tool → tell the user the one-line install NOW (`brew install xcodegen`) and agree on the
degraded-proof plan below before writing any code. Never discover this mid-build.

## Degraded-proof ladder (no .xcodeproj / no simulator available)
L5 app-target sources cannot be left "written but never compiled" — that shipped a broken screen
once. When `xcodegen`/simulator are unavailable, the MINIMUM proof is:
```bash
# 1. Build each package for the simulator (works WITHOUT an .xcodeproj — xcodebuild understands SPM):
cd Packages/{{PROJECT_NAME}}DS && xcodebuild -scheme {{PROJECT_NAME}}DS \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath /tmp/dd build
# (repeat for Core and DataLayer)
# 2. Typecheck the app-target sources against those products:
xcrun swiftc -typecheck -sdk $(xcrun --sdk iphonesimulator --show-sdk-path) \
  -target arm64-apple-ios26.0-simulator \
  -I /tmp/dd/Build/Products/Debug-iphonesimulator {{PROJECT_NAME}}/**/*.swift
```
Report which rung was reached (simulator screenshot > app build > typecheck > package tests).
A lower rung is acceptable ONLY if stated explicitly in the slice report and logged as debt.

> ⚠️ **Gotcha:** Symptom — a demo value ("~12 min", "5 items") presented as "computed by the
> engine" turns out fabricated. Rule — any number/string attributed to code must come from
> actually executed output (test log, REPL, app run). If you didn't run it, label it an estimate.
