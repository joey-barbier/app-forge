# NAVIGATION.md — Navigation Architecture

No navigation library, no global Coordinator. Three layers:
1. **Root gating** — `RootView` switches on store state (splash → onboarding → tabs).
2. **Per-tab `NavigationStack(path:)`** — value-based destinations, path mutated by Interactors.
3. **External-event routing** — a dedicated `PushRouter` object owned by the AppDelegate, with a weak store reference and a pending-event queue for cold-launch races.

## 1. Root gating

`RootView` is a pure state switch. No `NavigationStack` at the root — stacks live inside tabs.

```swift
@main
struct App: SwiftUI.App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var store = ItemStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task {
                    appDelegate.pushRouter.store = store   // wire BEFORE bootstrap
                    await store.bootstrap()
                }
        }
    }
}

struct RootView: View {
    @Environment(ItemStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if !store.isReady {
                App.Splash()            // first load — no flash of empty/default data
            } else if store.needsOnboarding {
                App.Welcome()           // first launch — complete profile before entering
            } else {
                tabs
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await store.handleForeground() } }
        }
    }

    private var tabs: some View {
        TabView {
            Tab("Feed", systemImage: "house.fill") { App.Feed() }        // owns its stack
            Tab("Map", systemImage: "map.fill") { NavigationStack { App.Map() } }
            Tab("Groups", systemImage: "person.2.fill") { App.Groups() } // owns its stack
            Tab("Profile", systemImage: "person.crop.circle.fill") { NavigationStack { App.Profile() } }
        }
    }
}
```

Rules:
- Gate on `store.isReady`, never on "data is empty" — empty is a valid state, loading is not.
- Tabs that push destinations own their `NavigationStack` *inside* the tab view (so the path lives in that tab's ViewModel). Tabs that never push get a plain `NavigationStack { }` wrapper in `RootView` for the nav bar.
- App-wide errors surface as one alert on `RootView` bound to `store.lastError`.

> ⚠️ **Gotcha:** an alert attached to the presenter cannot appear over a presented sheet. Symptom: errors thrown from a sheet's save action silently never show. Cause: SwiftUI presents one thing per branch; the root alert is occluded by the sheet. Fix: sheets that can fail keep their **own** local alert.

## 2. Per-tab stacks: typed paths + Interactor-driven navigation

Each tab follows View / ViewModel / Interactor. The **path is state on the ViewModel**; the **Interactor mutates it**. Views never use raw `NavigationLink` to other features and never know sibling screens exist.

```swift
extension App.Feed {
    @Observable
    final class ViewModel {
        /// Navigation path for this tab's stack — driven by the Interactor.
        var path: [ItemGroup] = []
        /// Drives the anchored popover for the tapped badge.
        var selectedBadgeID: String?
    }

    struct Interactor {
        let store: ItemStore
        let viewModel: ViewModel

        /// Navigation goes through the Interactor (no NavigationLink in the View).
        func openGroup(_ group: ItemGroup) {
            viewModel.path.append(group)
        }
    }
}

extension App.Feed {
    var body: some View {
        NavigationStack(path: $viewModel.path) {
            ScrollView { /* sections */ }
                .navigationDestination(for: ItemGroup.self) { App.GroupDetail(group: $0) }
        }
    }
}
```

- Single destination type per tab → path is `[ItemGroup]` directly. Multiple destination types → declare a tab-local `enum Route: Hashable { case group(ItemGroup), item(Item.ID) }`, path is `[Route]`, one `navigationDestination(for: Route.self)` switch.
- Pop = `viewModel.path.removeLast()`; pop-to-root = `viewModel.path = []`. Both testable without UI.
- Cross-tab "navigation" does not exist. If an external event must land on a specific screen, the store exposes state (e.g. `pendingInviteGroupID`) and the owning tab reacts to it — never reach into another tab's path.
- Name the domain type `ItemGroup`, not `Group`: `Group` collides with `SwiftUI.Group` in every view file.

## 3. External-event routing: `PushRouter`

One small `@MainActor` object bridges system callbacks (silent pushes, share/deeplink acceptance) to store refreshes. The AppDelegate owns it; the SwiftUI scene wires the store after launch.

```swift
@MainActor
final class PushRouter {
    weak var store: ItemStore? {
        didSet {
            // Cold-launch race: a share accepted before the scene wired the store
            // would otherwise be lost. Flush the queued event once the store connects.
            if store != nil, pendingShareAccept {
                pendingShareAccept = false
                Task { await didAcceptShare() }
            }
        }
    }
    private var pendingShareAccept = false

    /// Silent CloudKit push → targeted refresh (payload only says "something changed").
    func handle(_ notification: CKNotification) async {
        switch notification.notificationType {
        case .database:   await store?.refreshGroups()
        case .recordZone: await store?.refresh()
        default:          await store?.refresh(); await store?.refreshGroups()
        }
    }

    func didAcceptShare() async {
        guard let store else { pendingShareAccept = true; return }   // queue, don't drop
        await store.refreshGroups()
        try? await Task.sleep(for: .seconds(2))  // server-side propagation delay
        await store.refreshGroups()              // second pass picks up the new shared zone
    }
}
```

> ⚠️ **Gotcha (cold-launch race):** symptom — accepting a share invite while the app is cold-launched does nothing; the joined group never appears. Cause — `userDidAcceptCloudKitShareWith` fires *before* the SwiftUI scene runs `.task` and wires `pushRouter.store`, so the event hits a `nil` store and is dropped. Fix — set a `pending` flag in the guard and flush it in `store`'s `didSet` (shown above). Apply this queue-and-flush pattern to **every** external entry point (deeplinks, notification taps).

> ⚠️ **Gotcha (propagation delay):** symptom — after accepting a share, the first refresh returns no new data. Cause — the backend needs time to surface the newly shared zone after `accept`. Fix — refresh immediately *and* again after ~2s. Never rely on a single post-accept fetch.

## 4. Scene delegate: required even with SwiftUI lifecycle

In a SwiftUI App-lifecycle app, some system callbacks are delivered to the **scene** delegate, not the app delegate — CloudKit share acceptance (`userDidAcceptCloudKitShareWith`) is the canonical example. SwiftUI still creates and owns the window; you only *declare* the delegate class:

```swift
final class AppDelegate: NSObject, UIApplicationDelegate {
    let pushRouter = PushRouter()

    /// Declare the scene delegate class. SwiftUI keeps ownership of the window.
    func application(_ application: UIApplication,
                     configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: nil, sessionRole: session.role)
        if session.role == .windowApplication {
            config.delegateClass = SceneDelegate.self
        }
        return config
    }
}

final class SceneDelegate: NSObject, UIWindowSceneDelegate {
    func windowScene(_ windowScene: UIWindowScene,
                     userDidAcceptCloudKitShareWith metadata: CKShare.Metadata) {
        let pushRouter = (UIApplication.shared.delegate as? AppDelegate)?.pushRouter
        Task {
            try? await ShareAcceptance.accept(metadata)  // metadata is non-Sendable: consume it here
            await pushRouter?.didAcceptShare()
        }
    }
}
```

Rules:
- Do **not** implement `scene(_:willConnectTo:)` — that would take window ownership away from SwiftUI.
- Implement the share-accept callback in **both** delegates (app delegate gets it on some OS paths, scene delegate on others). Both funnel into the same `PushRouter` method, so duplication is one line.
- `CKShare.Metadata` is non-Sendable: accept it inside one `@MainActor` helper and only let Sendable results (IDs) escape.

> ⚠️ **Gotcha:** symptom — tapped invite links open the app but nothing happens; the app-delegate hook never fires. Cause — with the SwiftUI lifecycle the system delivers share acceptance to the *scene* delegate, and no scene delegate exists by default. Fix — the `configurationForConnecting` + `delegateClass` wiring above. Without it the callback is silently lost.

## 5. Popovers & sheets

Anchored detail (map markers, badge cells) uses `.popover` + `.presentationCompactAdaptation(.popover)` (anchored glass popover on iPhone instead of a sheet). One selection at a time via a `selectedID` + derived `Binding<Bool>`:

```swift
@State private var selectedID: UUID?

marker(item)
    .onTapGesture { selectedID = item.id }
    .popover(isPresented: binding(for: item.id)) {
        detail(item).presentationCompactAdaptation(.popover)
    }

private func binding(for id: UUID) -> Binding<Bool> {
    Binding(
        get: { selectedID == id },
        set: { isPresented in
            if isPresented { selectedID = id }
            else if selectedID == id { selectedID = nil }   // only clear if still ours
        }
    )
}
```

In the `set:` closure, guard `selectedID == id` before clearing — a stale dismiss from a previous popover must not wipe a newer selection.

> ⚠️ **Gotcha (orphaned popover — real production bug):** symptom — after deleting an item while its popover was open, tapping any other marker did nothing; the map was stuck. Cause — the item vanished from the list but `selectedID` still pointed to it, so SwiftUI kept trying to re-present a popover anchored to a non-existent annotation on every camera change, swallowing new selections. Two-part fix:
> 1. **Dismiss before mutating** in the detail view's destructive action:
> ```swift
> Button("Delete", role: .destructive) {
>     dismiss()        // close the popover FIRST so it can't orphan
>     onDelete?()
> }
> ```
> 2. **Prune stale selection** defensively in the container:
> ```swift
> .onChange(of: items.map(\.id)) { _, ids in
>     if let selected = selectedID, !ids.contains(selected) { selectedID = nil }
> }
> ```
> Do both. Never mutate a list while a presentation anchored to one of its rows is open.

Sheets (create/edit flows) follow the same discipline: a `Bool` or optional-item flag on the ViewModel (`isCreating`, `pendingInvite: GroupShare?`), toggled by the Interactor on success — the View never decides when a flow ends.

## Decision summary

| Concern | Pattern |
|---|---|
| Root routing | State switch in `RootView` (splash / onboarding / tabs) |
| In-tab navigation | `NavigationStack(path:)`, path on ViewModel, mutated by Interactor |
| Cross-feature navigation | Forbidden; react to store state instead |
| External events | `PushRouter` (weak store + pending queue flushed in `didSet`) |
| Share/deeplink entry | App delegate **and** scene delegate → same `PushRouter` |
| Anchored detail | `.popover` + `presentationCompactAdaptation(.popover)` + `selectedID` binding |
| Delete-while-presented | `dismiss()` first, then mutate; prune `selectedID` on list change |
