# CONVENTIONS — SwiftUI Architecture & Swift 6.2 Concurrency

Conventions for {{PROJECT_NAME}} (Swift 6.2, iOS 26, strict concurrency). Prescriptive — follow as written.

## 1. Architecture: VVM-I (View + ViewModel + Interactor + Translate)

Every **screen** lives in `App/<Screen>/`, split into up to 4 files:

| File | Type | Role |
|---|---|---|
| `App<Screen>.swift` | `struct ... : View` | Layout only. Reads state, delegates to Interactor. |
| `App<Screen>ViewModel.swift` | `@Observable final class` | UI state only (nav path, selection, sheet flags). No domain logic, no IO. |
| `App<Screen>Interactor.swift` | `struct` | Actions + derived data. The ONLY layer that talks to Stores/services. |
| `App<Screen>+Translate.swift` | `nonisolated enum` | User-facing strings + pure formatting. No state. |

```swift
// App/Feed/AppFeed.swift
extension App {
    struct Feed: View {
        @Environment(ItemStore.self) private var store
        @State private var viewModel = ViewModel()
        private var interactor: Interactor { Interactor(store: store, viewModel: viewModel) }
    }
}

extension App.Feed {
    var body: some View {
        NavigationStack(path: $viewModel.path) {
            // sections read interactor.<derived>, call interactor.<action>()
        }
        .navigationTitle(Translate.title)
        .navigationDestination(for: ItemGroup.self) { App.GroupDetail(group: $0) }
    }
}

// App/Feed/AppFeedViewModel.swift
extension App.Feed {
    @Observable final class ViewModel {
        var path: [ItemGroup] = []    // this tab's nav stack — pushed by the Interactor
        var selectedBadgeID: String?  // drives an anchored popover
    }
}

// App/Feed/AppFeedInteractor.swift
extension App.Feed {
    struct Interactor {
        let store: ItemStore
        let viewModel: ViewModel
        var invitations: [ItemGroup] { store.pendingInvitations }              // derived data
        func openGroup(_ group: ItemGroup) { viewModel.path.append(group) }    // navigation
        func accept(_ group: ItemGroup) async { await store.acceptInvitation(group) } // side effect
    }
}

// App/Feed/AppFeed+Translate.swift
extension App.Feed {
    nonisolated enum Translate {
        static let title = "Activity"
        static func greeting(_ name: String) -> String { "Hi \(name)" }
    }
}
```

Rules:
- Interactor is a **stateless struct**, recreated each render via a computed property. State lives in ViewModel (UI) or Store (domain) — never in the Interactor.
- Navigation goes through the Interactor (`viewModel.path.append(...)`), never inline in `body`.
- Each tab owns its `NavigationStack` + value-based `.navigationDestination(for:)`. No global path-based coordinator.
- **When each part is optional:** pure-display bricks = View only. Screen with UI state but no store actions = View + ViewModel + Translate (skip Interactor). Translate exists as soon as a file has user-facing copy — never inline strings in `body`.

Folder layout:
- `App/` — screens (one folder per screen, VVM-I files).
- `Module/` — reusable UI bricks (`Module/Map/`, `Module/Badge/`…): plain Views, closure-driven, store-free.
- `Store/` — `@MainActor @Observable` domain facades.
- `Packages/` — SPM: `Core` (pure domain, zero IO → `swift test` runs without a simulator), `DataLayer` (persistence/cloud), `{{PROJECT_NAME}}DS` (design system).

## 2. Swift 6.2 strict concurrency

- App target sets `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` — everything is MainActor unless marked otherwise. UI packages opt in with `.defaultIsolation(MainActor.self)` in `Package.swift`.
- The pure domain package keeps **nonisolated** default + `.swiftLanguageMode(.v6)`. Engines are `enum`s of static pure functions:

```swift
// Core package — pure, nonisolated, deterministic, instantly testable
public enum BadgeEngine {
    public static func satisfiedIDs(profile: Profile, items: [Item],
                                    calendar: Calendar = .current) -> Set<String> {
        var ids = Set<BadgeID>()              // typed ID enum: a typo is a compile error
        if items.count >= 1 { ids.insert(.first) }
        // … all rules are pure functions of (profile, items, calendar) — injected Calendar
        return Set(ids.map(\.rawValue))       // convert to stored String slugs at the boundary
    }
}
```

- `async/await` everywhere. **No completion handlers.** Framework delegate callbacks (e.g. `CLLocationManagerDelegate`) are `nonisolated`; hop back to the main actor explicitly to publish state.
- **Never `@unchecked Sendable`.** `nonisolated(unsafe)` is tolerated only in tests, with a comment explaining exactly which sending check it silences and why it is safe.
- View-lifetime async work: `.task { await store.bootstrap() }` and `.task(id:)` — auto-cancelled on disappear. Fire-and-forget from a tap: `Button { Task { await interactor.accept(group) } }`. Parallel fan-out: `withTaskGroup` / `async let`. No detached tasks.
- Mark `Translate` enums `nonisolated` explicitly: under MainActor default isolation they would otherwise be actor-isolated, blocking use from nonisolated formatting/background code.

## 3. The Store: `@MainActor @Observable` domain facade

```swift
@MainActor @Observable
final class ItemStore {
    private(set) var items: [Item] = []      // ALL read state is private(set)
    private(set) var isReady = false
    var lastError: String?                   // user-facing; one alert binds to it
    private var service: ItemService?

    func bootstrap() async {
        guard service == nil else { return } // idempotent — .task can re-fire
        // pick cloud backend if account available, else in-memory seeded with sample data
    }

    @discardableResult
    func addItem(_ draft: ItemDraft) async -> Bool {
        guard let service else { lastError = "Service unavailable."; return false }
        lastError = nil                      // start the action clean
        do { _ = try await service.add(draft); await refresh(); return true }
        catch {
            log.error("addItem failed: \(error, privacy: .public)")
            lastError = "Couldn't save. Try again."
            return false
        }
    }
}

extension ItemStore {
    static func preview() -> ItemStore { /* seeded with SampleData for #Preview */ }
}
```

Rules: mutations only through async funcs; every catch logs the operation name + maps to a human `lastError`; write actions return `Bool` so sheets dismiss **only when the write landed**; always provide a `static preview()` factory; in-memory backend doubles as offline/demo mode and is forced by a launch argument in UI tests.

> ⚠️ **Gotcha:** alert shows a stale error from a *previous* action. Cause: `lastError` survives across actions. Fix: reset `lastError = nil` as the first line of every store action.

> ⚠️ **Gotcha:** spinner never ends when the first load fails. Cause: `isReady` only set on success. Fix: set `isReady = true` in the catch too — surface an empty state + error, never spin forever.

> ⚠️ **Gotcha:** UI tests hang on a cold simulator. Cause: the cloud account-status probe stalls the first load. Fix: check `ProcessInfo.processInfo.arguments.contains("-uitest-mock")` in `bootstrap()` and wire the in-memory backend — deterministic and instant.

> ⚠️ **Gotcha:** first cloud sync fires a local notification for every pre-existing remote item. Cause: "new since last refresh" has no baseline. Fix: on first load, just seed the persisted "seen IDs" set without notifying; only diff against it on subsequent refreshes.

## 4. Namespacing by extension scoping

Scope feature views inside the domain type they render; scope screens inside `App`:

```swift
extension Item      { struct DetailCard: View { … } }  // call site: Item.DetailCard(item:)
extension ItemGroup { struct InviteCard: View { … } }  // call site: ItemGroup.InviteCard(group:…)
extension App       { struct Feed: View { … } }        // call site: App.Feed()

> ⚠️ **Gotcha:** the `App` namespace collides with the `SwiftUI.App` protocol. Two rules make it
> safe: (1) declare the namespace once — `enum App {}` in `App/AppNamespace.swift` (the scaffold
> ships it); (2) the @main entry point must be declared `struct {{PROJECT_NAME}}App: SwiftUI.App`
> (fully qualified) or it won't compile.
> ⚠️ **Gotcha:** a multi-statement `var body: some View` inside an `extension App.X` silently
> loses the implicit `@ViewBuilder` in some configurations — annotate `@ViewBuilder var body`
> explicitly in extension-scoped views, or keep `body` a single expression.
```

- File name = call-site path without the dot: `ItemDetailCard.swift`, `AppFeed.swift`, `AppFeed+Translate.swift`. **One type per file.**
- Why: free namespacing without submodules, no name clashes (`Item.DetailCard` vs `SharedItem.DetailCard` coexist), call sites read as domain language.
- Shared/non-domain bricks (skeletons, rating controls, generic map) stay top-level structs in `Module/`.

## 5. Closures as module boundaries

Module bricks never import Stores. Parents inject actions as closures; the brick stays reusable and testable in isolation:

```swift
extension ItemGroup {
    struct InviteCard: View {
        let group: ItemGroup
        // Side effect to know: a View storing closures can't be Equatable, so SwiftUI can't
        // skip its body via the Equatable fast-path. The parent recreates these closures every
        // render → this card re-renders with the parent. That's FINE: closures run on tap (not
        // render), @State persists by position, no retain cycle (struct), no stale capture
        // (value capture of `group`, reference to the store). Keep the design — it decouples
        // the brick from the store. If a large list ever hurts: conform Equatable on group.id.
        var onAccept: () -> Void
        var onDecline: () -> Void
    }
}
```

- Use optional closures (`var onDelete: (() -> Void)? = nil`) when absence changes the UI (e.g. hide the delete button).
- **Document the re-render side effect once** on a reference brick and point other bricks to it.

Generic bricks take the same idea further — one component, callers inject types and views:

```swift
struct ItemMap<Item: Identifiable, Marker: View, Detail: View>: View where Item.ID == UUID {
    @Binding var position: MapCameraPosition
    let items: [Item]
    let coordinate: (Item) -> Coordinate
    var onCenterChange: ((Coordinate) -> Void)? = nil   // reported continuously on camera move
    @ViewBuilder let marker: (Item) -> Marker
    @ViewBuilder let detail: (Item) -> Detail           // shown in a popover ANCHORED to the marker
    @State private var selectedID: UUID?
}
```

One map brick serves the personal screen AND every group screen; each injects its own typed marker/detail. Detail UI is an anchored `.popover` + `.presentationCompactAdaptation(.popover)` — never a centered sheet. Don't re-stamp glass effects; iOS 26 applies them natively on nav/toolbar/sheet/popover.

> ⚠️ **Gotcha:** after deleting an item, SwiftUI keeps re-creating the dead annotation on every camera change. Cause: the selection still points at the removed item, so the orphaned popover resurrects it. Fix: clear the selection when the item disappears:
> ```swift
> .onChange(of: items.map(\.id)) { _, ids in
>     if let s = selectedID, !ids.contains(s) { selectedID = nil }
> }
> ```

> ⚠️ **Gotcha:** delete-from-popover glitches (popover orphans mid-removal). Cause: the destructive closure removes the item while its anchored popover is still presented. Fix: `dismiss()` **first**, then call `onDelete?()`.

> ⚠️ **Gotcha:** map stutters while panning. Cause: continuous camera callbacks recompute derived state (clustering) every frame. Fix: only refresh when zoom changes meaningfully (e.g. >5% span delta), not on every pan frame.

## 6. Logging (OSLog)

```swift
import OSLog
let log = Logger(subsystem: "com.example.{{PROJECT_NAME}}", category: "Store")
log.notice("bootstrap: backend=\(label, privacy: .public) items=\(items.count)")
```

- One `Logger` per layer (`category: "Store"`, `"Sync"`, …). Every `catch` logs the failed operation by name.
- Stream from a device: `log stream --device --predicate 'subsystem == "com.example.{{PROJECT_NAME}}"'` — put this command in a doc comment next to the Logger.

> ⚠️ **Gotcha:** device logs show `<private>` instead of values. Cause: OSLog redacts interpolations by default. Fix: annotate non-sensitive debug values with `privacy: .public`. Never apply it to user content or tokens.

## 7. Naming quick reference

- Actions: verbs (`addItem`, `acceptInvitation`); derived data: nouns (`invitations`, `unlockedCount`).
- Booleans read as assertions: `isReady`, `needsDisplayName`, `isArchived`.
- Extension files: `TypeName+Role.swift` (`AppFeed+Translate.swift`).
- Centralize magic values: design tokens in `DS.Padding/Radius/Size`, the app display name and container IDs in single constants.
- Comments explain **why** (the decision, the side effect, the trap), never what the code already says.


## One type per file — the sanctioned exception
A repository **contract and its InMemory reference implementation may share one file**
(`Repository/ItemRepository.swift`): they form one teaching unit and ship/replace together.
Everything else stays one type per file. (Generated code violated the strict rule in every
audited project — codifying the exception beats pretending.)

> ⚠️ **Gotcha (previews):** Symptom — a preview renders empty while the app works. Cause — the
> preview built TWO store instances (one injected into the view, a different one bootstrapped
> with data). Fix — create ONE `Store.preview()` instance, seed it, and inject THAT everywhere
> in the preview.
