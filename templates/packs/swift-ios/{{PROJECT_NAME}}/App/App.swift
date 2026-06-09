import SwiftUI
import {{PROJECT_NAME}}DS

@main
struct {{PROJECT_NAME}}App: SwiftUI.App {   // qualified: `App` (unqualified) is our namespace enum
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}

/// Root gate — grows at kickoff into: !isReady → Splash, needsOnboarding → Welcome, else → tabs.
/// (See docs-architecture/NAVIGATION.md.)
struct RootView: View {
    var body: some View {
        ZStack {
            Color.DS.background.ignoresSafeArea()
            VStack(spacing: DS.Padding.m) {
                Text("{{PROJECT_NAME}}")
                    .designSystem(font: .largeTitle)
                    .foregroundStyle(DS.Gradients.brand)
                Text("Hello 👋")
                    .designSystem(font: .callout)
                    .foregroundStyle(Color.DS.textSecondary)
            }
        }
    }
}
