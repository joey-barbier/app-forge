/// Namespace for app screens: `extension App { struct Feed: View }` → call sites read `App.Feed`.
/// IMPORTANT: this enum collides with the `SwiftUI.App` protocol by design — the @main entry point
/// must declare `struct {{PROJECT_NAME}}App: SwiftUI.App` (fully qualified). See CONVENTIONS.md §3.
enum App {}
