# ARCHITECTURE — Layered "Lego Brick" iOS App

Pattern for SwiftUI apps (Swift 6.2, strict concurrency, iOS 26 app / iOS 18 packages). The app
is assembled from
independently buildable bricks: 3 local SPM packages + 3 app-target folders. Every layer below the
app target compiles and tests with plain `swift build` / `swift test` — no Xcode, no simulator.

## 1. Layer Model — Swift instantiation of the universal L0–L5 contract

This maps `ARCHITECTURE_PRINCIPLES.md` (read it first) onto SPM packages + app folders:

```
L5  COMPLETE FEATURES   App/      user-facing screens assembling bricks (VVM-I)
                        Store/    @Observable app state, composition root (picks real vs InMemory)
                        Tools/    cross-cutting: router, schedulers, formatters, location
L4  SHARED FEATURES     Module/   reusable domain-aware UI bricks   Module/Item, Module/ItemGroup, Module/Map
L3  CORE LOGIC          Packages/{{PROJECT_NAME}}Core   (pure Swift) domain models + engines + services
                                                        + repository CONTRACTS + InMemory impls
L3  CORE UI             Packages/{{PROJECT_NAME}}DS — Components/   domain-blind components (buttons, cards…)
L2  DATA                Packages/DataLayer  (IO)  repository IMPLEMENTATIONS (CloudKit/network)
                                                  + CKRecord↔domain mapping  — implements L3 contracts
L1  OPS                 no dedicated package until needed — logging conventions live in CONVENTIONS.md;
                        create Packages/Ops (remote config, analytics, feature flags) the day a slice needs it
L0  FOUNDATION          Packages/{{PROJECT_NAME}}DS — tokens   DS.Padding/Radius, Color.DS.*, DS.Font
                        + base extensions/formatters
```

Notes on the mapping:
- **The DS package physically hosts two layers**: L0 (tokens) and L3 Core UI (Components/).
  Internal rule: Components import tokens, never the reverse.
- **DataLayer implements Core's contracts** — the one sanctioned upward arrow (ports & adapters):
  it may import L3 protocols + models, never services/engines.
- **Imports point downward only** everywhere else; a feature never imports a sibling feature.

Brick rule: **Module/ components must work in any app screen; App/ screens are throwaway
assemblies.** When in doubt, start in App/ and promote to Module/ on second use.

## 2. Dependency Direction Rules

| Layer (L#) | May import | Must NEVER import | Why |
|---|---|---|---|
| L3 Core Logic ({{PROJECT_NAME}}Core) | Foundation (the Swift module) only | SwiftUI, UIKit, CloudKit, DataLayer | Tests run on the macOS host in seconds; logic stays platform-portable |
| L2 DataLayer | L3 contracts/models + IO frameworks (CloudKit, URLSession) | SwiftUI, the app target | It only implements Core protocols |
| L0+L3-UI {{PROJECT_NAME}}DS | SwiftUI | Core, DataLayer | Tokens/components are domain-blind, reusable across apps |
| L4 Module/ | L3 Core, DS | DataLayer, Store types in signatures | Bricks take domain values + closures, not the store |
| L5 App/ | everything | — | Final assembly point |
| L5 Store/ | L3 Core, L2 DataLayer | DS (it has no UI) | Sole place that knows which repository implementation runs |

> ⚠️ **Gotcha:** Symptom — `swift test` on Core suddenly needs a simulator destination and takes
> minutes. Cause — someone added `import SwiftUI` (often for `Color` or `@Observable` view helpers)
> to a domain file. Fix — Core stays UI-free; presentation mapping (colors, labels) lives in
> Module/ extensions, e.g. `extension Item.Status { var dsColor: Color }` in the app target.

> ⚠️ **Gotcha:** Symptom — testing a Service or ViewModel forces importing CloudKit and an iCloud
> account. Cause — repository protocol was declared in DataLayer next to its implementation.
> Fix — `protocol ItemRepository: Sendable` lives in **Core**, alongside an
> `actor InMemoryItemRepository: ItemRepository` for tests/previews/offline. DataLayer only ships
> `CloudKitItemRepository` (or `URLSessionItemRepository`, etc.) conforming to it.

## 3. SPM Local Packages — one Package.swift per layer

```swift
// Packages/{{PROJECT_NAME}}Core/Package.swift
// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "{{PROJECT_NAME}}Core",
    platforms: [.iOS(.v18), .macOS(.v14)],          // macOS = host-runnable tests
    products: [.library(name: "{{PROJECT_NAME}}Core", targets: ["{{PROJECT_NAME}}Core"])],
    targets: [
        .target(name: "{{PROJECT_NAME}}Core", swiftSettings: [.swiftLanguageMode(.v6)]),
        .testTarget(name: "{{PROJECT_NAME}}CoreTests", dependencies: ["{{PROJECT_NAME}}Core"],
                    swiftSettings: [.swiftLanguageMode(.v6)]),
    ]
)
```

- DataLayer adds `dependencies: [.package(path: "../{{PROJECT_NAME}}Core")]` and its own test target.
- The DS package adds `.defaultIsolation(MainActor.self)` to its swiftSettings.
- Xcode: add the three local packages to the app target once; they resolve by path.

> ⚠️ **Gotcha:** Symptom — a SwiftUI-only design-system package drowns in Swift 6 errors
> ("call to main actor-isolated…") on every component. Cause — SwiftUI types are MainActor-bound
> but package code defaults to nonisolated. Fix — set `.defaultIsolation(MainActor.self)` on the
> DS target instead of annotating every struct. Do NOT set it on Core (its actors/engines must
> stay nonisolated) or DataLayer.

## 4. Layer Contracts

### Core — pure business logic
- **Domain**: `Sendable` value types (`Item`, `ItemDraft`, `User`, `ItemGroup`, `Coordinate`, `Stats`).
  Never name a domain type `Group` — it collides with `SwiftUI.Group` in every view file.
- **Engine**: pure static funcs on caseless enums — `ScoreEngine`, `StatsEngine.compute(...)`,
  `AchievementEngine`. Deterministic in/out, no IO, no clock access (pass `now: Date` as parameter).
- **Catalog**: static data tables (achievement definitions, levels) — rules stay in engines, data
  in catalogs; never encode rules as stored JSON conditions.
- **Repository**: protocols + in-memory actor implementations.
- **Service**: `actor ItemService` orchestrating one transaction across engines + repository,
  e.g. `addItem(_:now:) -> AddItemResult` (persist + score + unlocks in one testable unit).

### DataLayer — IO implementations
- One repository class/actor per Core protocol, plus mapping files (`CKRecord+Mapping.swift`,
  `DTO+Mapping.swift`) and config (`CloudKitConfig` holding the single container ID constant
  `iCloud.com.example.{{PROJECT_NAME}}` — one constant, referenced everywhere, equal to the entitlement).

> ⚠️ **Gotcha:** Symptom — Swift 6 data-race errors (or runtime corruption) around `CKRecord`.
> Cause — `CKRecord` is non-`Sendable`; it must not cross actor boundaries. Fix — fetch and map
> to `Sendable` domain values **inside** the repository actor; only domain types ever leave it.

> ⚠️ **Gotcha:** Symptom — right after accepting a share / receiving a push, an immediate refresh
> fails with "Record not found" though the data exists. Cause — server-side propagation delay on
> freshly shared zones/records. Fix — on remote-triggered refreshes, add a short delay (~1.5 s)
> or one retry before surfacing an error.

### {{PROJECT_NAME}}DS — design system
Tokens as namespaces (`DS.Padding.m`, `DS.Gradients.brand`, `Color.DS.accent`, `DSFont`), plus
generic components (`DSBackground`, button styles, cards). Nothing here knows the domain.

### Module/ — reusable UI bricks (app target)
One folder per domain concept (`Module/Item/`, `Module/Map/`). Bricks receive domain values and
closures — never the store. Prefer generics for shared mechanics, e.g. one
`ItemMap<Item, Marker: View, Detail: View>` used by every map screen (selection, clustering,
anchored popover live here; screens inject `marker:` and `detail:` builders).
A brick becomes navigable through closures injected by the parent screen — no router dependency:

```swift
// child brick:    var onAccept: () -> Void   // plain stored closure(s); domain value captured by value
// parent screen:  Button { interactor.openDetail(group) } label: { ItemGroup.Row(group: group) }
//                 ItemGroup.InviteCard(group: group, onAccept: { Task { await interactor.accept(group) } }, …)
```
The parent's Interactor owns the routing (`viewModel.path.append`) — no environment plumbing,
no third-party DI/navigation package.

### App/ — screens, VVM-I pattern
Per screen, one folder with up to 4 files:
- `App<Screen>.swift` — View, namespaced via extension: `extension App { struct Detail: View }`,
  `body` in `extension App.Detail`. Deps via `@Environment`; `@State private var viewModel = ViewModel()`.
- `App<Screen>ViewModel.swift` — `@Observable final class ViewModel`: local UI state ONLY. No business
  logic, no navigation, no store reference.
- `App<Screen>Interactor.swift` — `struct Interactor` with deps injected by init (store, router path);
  business calls + routing. Recreated on demand:
  `private var interactor: Interactor { Interactor(viewModel: viewModel, store: store) }`.
  Trivial screens (no routing/orchestration) may omit it.
- `App<Screen>+Translate.swift` — `nonisolated enum Translate` of user-facing string constants
  (+ pure formatting helpers). No state, no logic.

Navigation: a `TabView` shell where **each tab owns its `NavigationStack`** with value-based
`.navigationDestination(for: ItemGroup.self)`. Add a global `@Observable` Coordinator (path array +
`goTo(_:)`) only for single-stack, deep-link-driven apps — most tab apps don't need one.

### Store/ — observable state + composition root
`@MainActor @Observable final class AppStore`: wraps Core services, exposes `private(set)` state
and intent methods. It is the ONLY place deciding which backend runs:

```swift
func bootstrap() async {
    guard service == nil else { return }
    if ProcessInfo.processInfo.arguments.contains("-uitest-mock") {
        activateMemoryBackend(); await refresh(); return
    }
    let cloud = CloudKitItemRepository()
    if await cloud.isAccountAvailable() { service = ItemService(repository: cloud); backend = .cloud }
    else { activateMemoryBackend() }   // seeded with SampleData → app fully demoable offline
    await refresh()
}
```

Injected once at the root: `@State private var store = AppStore()` → `.environment(store)` on the
root view. No DI container. `SampleData` lives next to the store and feeds previews, the in-memory
backend, and UI tests. On `scenePhase == .active`, upgrade a memory backend to cloud if an account
appeared, then refresh. Intents that gate UI return success:
`@discardableResult func addItem(_ draft: ItemDraft) async -> Bool` — the sheet dismisses only
when the write landed.

> ⚠️ **Gotcha:** Symptom — UI tests and cold simulators hang on first launch. Cause — the cloud
> account probe (`CKContainer.accountStatus`) can stall with no account configured. Fix — a launch
> argument (`-uitest-mock`) short-circuits straight to the in-memory backend; the simulator
> fallback path keeps the app demoable with sample data.

> ⚠️ **Gotcha:** Symptom — infinite splash spinner when the first load fails. Cause — `isReady`
> was only set on the success path. Fix — set `isReady = true` in the catch too, and surface
> `lastError`; an empty state beats a dead spinner.

> ⚠️ **Gotcha:** Symptom — a stale error alert pops during an unrelated, successful action.
> Cause — `lastError` from a previous failure was never cleared. Fix — first line of every intent:
> `lastError = nil`.

> ⚠️ **Gotcha:** Symptom — error alert never appears while a sheet is presented. Cause — an alert
> attached to the presenting view cannot cover a presented sheet. Fix — the app-wide alert lives on
> the root view, AND any sheet that can fail (e.g. the add form) declares its own local alert.

### Tools/ — cross-cutting
Router/Coordinator (if used), notification scheduler, push routing, formatters, location provider.
Anything used by multiple screens that is neither domain logic nor a visual component.

## 5. Where Does a New File Go?

| You are adding… | It lives in… |
|---|---|
| A domain value type | `Packages/{{PROJECT_NAME}}Core/Sources/{{PROJECT_NAME}}Core/Domain/` |
| A pure rule (scoring, validation, stats) | `Core/Engine/` — static func, `now`/inputs as params |
| Static data tables (levels, definitions) | `Core/Catalog/` |
| A persistence/network contract | `Core/Repository/` (protocol + `InMemory…` actor) |
| Multi-step domain transaction | `Core/Service/` (actor) |
| The real backend implementation + DTO mapping | `Packages/DataLayer/` |
| Color/spacing/font token, domain-blind component | `Packages/{{PROJECT_NAME}}DS/` |
| Reusable UI for a domain concept (ItemCard, ItemMap) | app `Module/<Concept>/` |
| A user-facing screen | app `App/<Screen>/` — View + ViewModel (+ Interactor + Translate) |
| App-wide state or a new user intent | `Store/AppStore.swift` |
| Preview/demo/test fixture data | `Store/SampleData.swift` |
| Scheduler, router, formatter, location | `Tools/` |

## 6. Why This Works Exceptionally Well With AI Agents

- **Fast ground truth without Xcode.** `cd Packages/{{PROJECT_NAME}}Core && swift test` runs the whole business
  logic suite on the host Mac in seconds — no simulator boot, no signing. Agents iterate on
  logic with a compile+test loop per edit.
- **Compiler-enforced boundaries.** An agent that violates layering (imports SwiftUI in Core,
  references the store in a Module brick) gets an immediate build error instead of silently
  degrading the architecture.
- **Deterministic UI without a backend.** The in-memory repository + `SampleData` + `-uitest-mock`
  launch arg let agents build screens, run UI tests, and take simulator screenshots with zero
  accounts or network.
- **Predictable file placement.** The VVM-I naming convention and the table above mean an agent
  knows exactly which 3–4 files to create for a feature — diffs stay small and reviewable.
- **Engines are pure functions.** Time, randomness, and IO are parameters, so agents can write
  exhaustive table-driven tests (`swift test`) without mocks or fakes beyond `InMemory…` actors.

Build matrix an agent should run before claiming "done":
```
cd Packages/{{PROJECT_NAME}}Core && swift test            # logic — seconds
cd Packages/DataLayer && swift build      # IO compiles against Core contracts
cd Packages/{{PROJECT_NAME}}DS && swift build
xcodebuild -project "{{PROJECT_NAME}}/{{PROJECT_NAME}}.xcodeproj" -scheme {{PROJECT_NAME}} \
  -destination 'generic/platform=iOS Simulator' build                  # app assembly only
```


## Acceptable variations
The Store-internal `bootstrap()` shown above is the default, not dogma. Known-good variants:
- **Protocol-based init injection** (`Store(repository: some ItemRepository)`) — preferred by
  teams that want the composition root outside the Store. Fine: record it in
  `.claude/memory/DECISIONS.md` and keep ONE pattern per project.
Deviating consciously is healthy; deviating silently is how two conventions end up in one repo
(see ANTI_PATTERNS.md).
