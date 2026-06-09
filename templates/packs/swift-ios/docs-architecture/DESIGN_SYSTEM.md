# Design System Package — {{PROJECT_NAME}}DS

All visual tokens (colors, fonts, spacing, radius, gradients, reusable chrome) live in a dedicated local SPM package: `Packages/{{PROJECT_NAME}}DS`. App code **never** hardcodes a color, font size, padding, or corner radius. If a view needs a visual value, it imports `{{PROJECT_NAME}}DS` and uses a token.

## Why a package (not a folder in the app target)

- **Enforced via imports.** A file that uses `Color.DS.accent` must `import {{PROJECT_NAME}}DS`. Raw values (`Color(red:...)`, `.padding(17)`, `.font(.system(size: 13))`) are instantly visible in review/lint — they are the *only* place numbers appear outside the package.
- **Previewable standalone.** The package builds without the app. Components (`GlassCard`, button styles) get previews inside the package; designers iterate without app build times.
- **AI agents cannot "forget" it.** Agents grep the package for the token vocabulary; any raw value they emit stands out in the diff. Prescribe in CLAUDE.md: *"Visual values come from {{PROJECT_NAME}}DS tokens only."*
- **Reusable.** The same `DS.*` API shape ports between projects; only token values change.

## Package layout

```
Packages/{{PROJECT_NAME}}DS/
├── Package.swift
└── Sources/{{PROJECT_NAME}}DS/
    ├── DS.swift              # namespace: Padding, Radius, Size, ratio
    ├── Color+DS.swift        # Color.DS.* palette + DS.Gradients
    ├── DSFont.swift          # DS.Font type scale + .designSystem(font:) modifier
    └── Components/
        ├── DSBackground.swift    # app-wide background + .dsBackground() modifier
        ├── GlassCard.swift       # standard card container
        └── DSButtonStyle.swift   # .dsPrimary / .dsSecondary button styles
```

```swift
// Package.swift
// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "{{PROJECT_NAME}}DS",
    platforms: [.iOS(.v18), .macOS(.v14)],
    products: [.library(name: "{{PROJECT_NAME}}DS", targets: ["{{PROJECT_NAME}}DS"])],
    targets: [
        .target(
            name: "{{PROJECT_NAME}}DS",
            swiftSettings: [
                .swiftLanguageMode(.v6),
                .defaultIsolation(MainActor.self),
            ]
        ),
    ]
)
```

> ⚠️ **Gotcha:** Swift 6 strict concurrency rejects the token statics. Symptom: `Static property 'brand' is not concurrency-safe because non-'Sendable' type 'LinearGradient'…` on every gradient/color token. Cause: `static let` of non-Sendable SwiftUI types in a nonisolated namespace. Fix: set `.defaultIsolation(MainActor.self)` on the package target (tokens are UI-only anyway), and mark value types like `DS.Font` explicitly `Sendable` so they can cross isolation when needed.

Add to the app as a **local package reference** (`Packages/{{PROJECT_NAME}}DS` relative path) and link the library product to the app target.

## Starter token set

### Namespace + layout tokens — `DS.swift`

```swift
import SwiftUI

public enum DS {
    /// Responsive scaling hook. 1.0 for now; derive from screen class later.
    public static let ratio: CGFloat = 1.0

    public enum Padding {
        public static let xs: CGFloat = 4 * DS.ratio
        public static let s: CGFloat = 8 * DS.ratio
        public static let m: CGFloat = 16 * DS.ratio
        public static let l: CGFloat = 24 * DS.ratio
        public static let xl: CGFloat = 40 * DS.ratio
    }

    public enum Radius {
        public static let s: CGFloat = 10 * DS.ratio
        public static let m: CGFloat = 16 * DS.ratio
        public static let l: CGFloat = 24 * DS.ratio
        public static let pill: CGFloat = 999
    }

    public enum Size {
        public static let hairline: CGFloat = 1
        public static let icon: CGFloat = 24 * DS.ratio
    }
}
```

> ⚠️ **Gotcha:** `DS.ratio` is baked in at first static access (`static let`). Symptom: changing `ratio` at runtime does nothing. Cause: tokens are constants, not computed. Keep it as a build-time/launch-time knob; if you need live scaling, make tokens computed `static var` — accepting the perf cost — don't half-migrate.

### Semantic colors + gradients — `Color+DS.swift`

```swift
import SwiftUI

public extension Color {
    enum DS {
        // Brand
        public static let accent = Color(red: 0.20, green: 0.55, blue: 1.00)
        public static let accentSecondary = Color(red: 0.55, green: 0.30, blue: 0.95)
        // Dark-first base: surfaces are white-alpha layered over the background
        public static let background = Color(red: 0.04, green: 0.04, blue: 0.06)
        public static let surface = Color.white.opacity(0.06)
        public static let surfaceStrong = Color.white.opacity(0.10)
        public static let stroke = Color.white.opacity(0.12)
        public static let textPrimary = Color.white
        public static let textSecondary = Color.white.opacity(0.6)
        public static let textTertiary = Color.white.opacity(0.4)
        // Status
        public static let success = Color(red: 0.20, green: 0.85, blue: 0.45)
        public static let danger = Color(red: 1.00, green: 0.27, blue: 0.36)
    }
}

public extension DS {
    enum Gradients {
        public static let brand = LinearGradient(
            colors: [Color.DS.accent, Color.DS.accentSecondary],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }
}
```

> ⚠️ **Gotcha:** `Color.DS` shadows the top-level `DS` namespace inside `extension Color`. Symptom: `DS.ratio` / `DS.Padding` "not found" or resolves to the wrong type in that file. Cause: Swift name lookup prefers the nested `Color.DS`. Fix: qualify with the module name (`{{PROJECT_NAME}}DS.DS.ratio`) inside `Color+DS.swift`, or keep raw values local to that file (it's the one file allowed to contain them).

> ⚠️ **Gotcha:** Opacity-based surfaces stack. Symptom: a card nested inside another card is visibly lighter than the spec. Cause: `white.opacity(0.06)` over `white.opacity(0.06)` compounds. Fix: never nest `surface` in `surface`; inner emphasis uses `surfaceStrong` deliberately, or restructure the layout.

### Type scale + modifier — `DSFont.swift`

```swift
import SwiftUI

public extension DS {
    struct Font: Sendable {
        public var size: CGFloat
        public var weight: SwiftUI.Font.Weight
        public var design: SwiftUI.Font.Design

        public init(size: CGFloat, weight: SwiftUI.Font.Weight = .regular,
                    design: SwiftUI.Font.Design = .rounded) {
            self.size = size; self.weight = weight; self.design = design
        }

        /// Swap to a bundled custom font later by changing only this property.
        public var swiftUIFont: SwiftUI.Font {
            .system(size: size * DS.ratio, weight: weight, design: design)
        }

        public static let largeTitle = Font(size: 34, weight: .black)
        public static let title = Font(size: 28, weight: .bold)
        public static let h2 = Font(size: 22, weight: .bold)
        public static let h3 = Font(size: 18, weight: .semibold)
        public static let body = Font(size: 16, weight: .regular)
        public static let callout = Font(size: 14, weight: .medium)
        public static let caption = Font(size: 12, weight: .medium)
        public static let button = Font(size: 16, weight: .bold)
        public static let mono = Font(size: 16, weight: .semibold, design: .monospaced)
    }
}

public extension View {
    func designSystem(font: DS.Font) -> some View {
        self.font(font.swiftUIFont)
    }
}
```

> ⚠️ **Gotcha:** `DS.Font` shadows `SwiftUI.Font` inside the `DS` extension. Symptom: `'Font' has no member 'Weight'` / circular reference errors. Cause: unqualified `Font` resolves to the struct being defined. Fix: always write `SwiftUI.Font.Weight` / `SwiftUI.Font.Design` inside `DSFont.swift`.

### Components (chrome, not features)

The package also owns visual chrome reused everywhere — kept feature-agnostic:

- `DSBackground` — `ZStack { Color.DS.background; radial accent glows }.ignoresSafeArea()`, exposed as `.dsBackground()` which wraps content in a `ZStack` (background behind, content stays in safe area).
- `GlassCard { … }` — `surface` fill, `Radius.l` continuous corners, `stroke` hairline border.
- `DSPrimaryButtonStyle` / `DSSecondaryButtonStyle` — exposed via `static var dsPrimary/dsSecondary` on `ButtonStyle` so call sites read `.buttonStyle(.dsPrimary)`.

> ⚠️ **Gotcha:** Applying the background via `.background(DSBackground())` clips the radial glows to the modified view's bounds. Symptom: glow edges cut off, background not full-screen under bars. Fix: the `.dsBackground()` modifier wraps in a `ZStack` and `DSBackground` itself calls `.ignoresSafeArea()` — consumers never manage safe areas for the backdrop.

## Dark-first design

The app is dark-first: `background` is near-black, text is white-alpha, surfaces are white-alpha overlays. Tokens are *semantic* (`textSecondary`, `surfaceStrong`, `stroke`) — never named after raw values (`white60`, `gray2`). Call sites express intent; a future light theme means editing one file.

> ⚠️ **Gotcha:** Dark palette without dark scheme. Symptom: sheets, alerts, and keyboards render system-light — white sheet, white `textPrimary` text = invisible content. Cause: hardcoded dark tokens don't switch UIKit-managed chrome. Fix: set `.preferredColorScheme(.dark)` at the app root so system chrome matches the palette.

## Usage style (consumer)

```swift
import SwiftUI
import {{PROJECT_NAME}}DS

struct ItemDetailCard: View {
    let item: Item

    var body: some View {
        VStack(alignment: .leading, spacing: DS.Padding.m) {
            HStack(spacing: DS.Padding.m) {
                Image(systemName: item.icon)
                    .foregroundStyle(AnyShapeStyle(DS.Gradients.brand))
                    .background(Color.DS.surfaceStrong, in: Circle())
                Text(item.name)
                    .designSystem(font: .h3)
                    .foregroundStyle(Color.DS.textPrimary)
            }
            Text(item.detail)
                .designSystem(font: .body)
                .foregroundStyle(Color.DS.textSecondary)
            Divider().overlay(Color.DS.stroke)
            Label(item.status, systemImage: "checkmark.seal.fill")
                .designSystem(font: .callout)
                .foregroundStyle(Color.DS.success)
        }
        .padding(DS.Padding.l)
        .clipShape(RoundedRectangle(cornerRadius: DS.Radius.m, style: .continuous))
    }
}
```

Note the pattern: `.designSystem(font:)` sets typography only; color is always a separate `.foregroundStyle(Color.DS.*)`. Mixing a gradient and a color in one conditional requires `AnyShapeStyle(...)` on both branches.

## How to add a token

1. **Check it doesn't exist** — grep `Sources/{{PROJECT_NAME}}DS/` first. Prefer reusing a semantic token over adding a near-duplicate.
2. Add the `static let` in the right file (`Color+DS.swift`, `DS.swift`, or `DSFont.swift`) with a **semantic name** (what it's *for*, not what it *looks like*).
3. Multiply layout values by `DS.ratio`.
4. Use it from the app via the token only. Never copy the raw value to a call site "just this once".

## Rules (for humans and AI agents)

- Do use `DS.Padding.*`, `DS.Radius.*`, `Color.DS.*`, `DS.Gradients.*`, `.designSystem(font:)` for every visual value. Never `.padding(12)`, `Color(red:...)`, `.font(.system(...))` in app code — raw values belong only inside the DS package.
- Do put reusable visual chrome (cards, backgrounds, button styles) in `Components/`. Never put feature logic, models, or networking in the DS package — it stays dependency-free.
- Corner shapes: always `RoundedRectangle(cornerRadius: DS.Radius.*, style: .continuous)`.
- Hairlines: `DS.Size.hairline` with `strokeBorder(Color.DS.stroke, ...)`.
