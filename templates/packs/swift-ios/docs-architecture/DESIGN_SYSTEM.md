# Design System Package — {{PROJECT_NAME}}DS

All visual tokens (colors, fonts, spacing, radius, gradients, reusable chrome) live in a dedicated local SPM package: `Packages/{{PROJECT_NAME}}DS`. App code **never** hardcodes a color, font size, padding, or corner radius. If a view needs a visual value, it imports `{{PROJECT_NAME}}DS` and uses a token.

## Why a package (not a folder in the app target)

- **Enforced via imports.** A file that uses `Color.DS.accent` must `import {{PROJECT_NAME}}DS`. Raw values (`Color(red:...)`, `.padding(17)`, `.font(.system(size: 13))`) are instantly visible in review/lint — they are the *only* place numbers appear outside the package.
- **Previewable standalone.** The package builds without the app. Components (`DSCard`, and any chrome you add) get previews inside the package; designers iterate without app build times.
- **AI agents cannot "forget" it.** Agents grep the package for the token vocabulary; any raw value they emit stands out in the diff. Prescribe in CLAUDE.md: *"Visual values come from {{PROJECT_NAME}}DS tokens only."*
- **Reusable.** The same `DS.*` API shape ports between projects; only token values change.

## Package layout (what the skeleton actually ships)

```
Packages/{{PROJECT_NAME}}DS/
├── Package.swift
└── Sources/{{PROJECT_NAME}}DS/
    ├── DS.swift              # namespace: Padding, Radius, Size, ratio, Gradients
    ├── Color+DS.swift        # Color.DS.* palette
    ├── DSFont.swift          # enum DS.Font type scale + .designSystem(font:) modifier
    └── Components/
        └── DSCard.swift      # starter card container (token-only, domain-blind)
```

That is the entire starter surface. The four token files plus `DSCard` are the contract every
example below uses. Anything richer (an app-wide background, a glass card, semantic button styles)
is something you **add at kickoff** — see "Components to add at kickoff" at the end. Do not reference
an API the package doesn't ship yet; add the file first, then use it.

```swift
// Package.swift — matches the shipped skeleton (iOS 26 everywhere; app target and packages bump together)
// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "{{PROJECT_NAME}}DS",
    platforms: [.iOS(.v26), .macOS(.v15)],
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

> ⚠️ **Gotcha:** Swift 6 strict concurrency rejects the token statics. Symptom: `Static property 'brand' is not concurrency-safe because non-'Sendable' type 'LinearGradient'…` on every gradient/color token. Cause: `static let` of non-Sendable SwiftUI types in a nonisolated namespace. Fix: set `.defaultIsolation(MainActor.self)` on the package target (tokens are UI-only anyway). If you later replace the shipped `enum DS.Font` with a value-carrying `struct` that must cross isolation, mark it `Sendable` then.

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

    /// Signature gradients live in the DS namespace (NOT in the Color extension).
    public enum Gradients {
        public static let brand = LinearGradient(
            colors: [Color.DS.accent, Color.DS.accentSecondary],
            startPoint: .topLeading, endPoint: .bottomTrailing
        )
    }
}
```

> ⚠️ **Gotcha:** `DS.ratio` is baked in at first static access (`static let`). Symptom: changing `ratio` at runtime does nothing. Cause: tokens are constants, not computed. Keep it as a build-time/launch-time knob; if you need live scaling, make tokens computed `static var` — accepting the perf cost — don't half-migrate.

### Semantic colors — `Color+DS.swift`

```swift
import SwiftUI

public extension Color {
    enum DS {
        // Brand
        public static let accent = Color(red: 0.35, green: 0.45, blue: 1.00)
        public static let accentSecondary = Color(red: 0.55, green: 0.30, blue: 0.95)
        // Dark-first base: surfaces are white-alpha layered over the background
        public static let background = Color(red: 0.039, green: 0.039, blue: 0.059)
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
```

Gradients (`DS.Gradients.brand`) live in `DS.swift` (shown above), not in this file — the Color
extension holds only flat colors.

> ⚠️ **Gotcha:** `Color.DS` shadows the top-level `DS` namespace inside `extension Color`. Symptom: `DS.ratio` / `DS.Padding` "not found" or resolves to the wrong type in that file. Cause: Swift name lookup prefers the nested `Color.DS`. Fix: qualify with the module name (`{{PROJECT_NAME}}DS.DS.ratio`) inside `Color+DS.swift`, or keep raw values local to that file (it's the one file allowed to contain them).

> ⚠️ **Gotcha:** Opacity-based surfaces stack. Symptom: a card nested inside another card is visibly lighter than the spec. Cause: `white.opacity(0.06)` over `white.opacity(0.06)` compounds. Fix: never nest `surface` in `surface`; inner emphasis uses `surfaceStrong` deliberately, or restructure the layout.

### Type scale + modifier — `DSFont.swift`

The skeleton ships `DS.Font` as a **case enum** mapping each role to a system font — call sites read
`.designSystem(font: .h3)`. (A value-carrying `struct` with `size`/`weight`/`design` is a valid V2
upgrade if you bundle a custom font; until then the enum is the shipped, simpler shape — extend it,
don't swap it just to match older prose.)

```swift
import SwiftUI

public extension DS {
    /// Typography scale. Use through `.designSystem(font:)` — never `.font(.system(...))` in app code.
    enum Font {
        case largeTitle, title, h2, h3, body, callout, caption, button, mono

        var font: SwiftUI.Font {
            switch self {
            case .largeTitle: .system(size: 34, weight: .bold)
            case .title:      .system(size: 28, weight: .bold)
            case .h2:         .system(size: 22, weight: .semibold)
            case .h3:         .system(size: 17, weight: .semibold)
            case .body:       .system(size: 17)
            case .callout:    .system(size: 15)
            case .caption:    .system(size: 12)
            case .button:     .system(size: 17, weight: .semibold)
            case .mono:       .system(size: 15, design: .monospaced)
            }
        }
    }
}

public extension View {
    func designSystem(font: DS.Font) -> some View { self.font(font.font) }
}
```

> ⚠️ **Gotcha:** `DS.Font` shadows `SwiftUI.Font` inside the `DS` extension. Symptom: `'Font' has no member 'system'` / circular reference errors. Cause: unqualified `Font` resolves to the enum being defined. Fix: the mapping property's return type is written `SwiftUI.Font` (fully qualified) inside `DSFont.swift`; do the same for any `SwiftUI.Font.Weight` / `.Design` you reference.

### Components (chrome, not features)

The `Components/` folder owns visual chrome reused everywhere — kept feature-agnostic (no domain
types, no networking). **The skeleton ships exactly one: `DSCard`.**

```swift
// Components/DSCard.swift — the one component that ships
public struct DSCard<Content: View>: View {
    private let content: Content
    public init(@ViewBuilder content: () -> Content) { self.content = content() }

    public var body: some View {
        content
            .padding(DS.Padding.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.DS.surface, in: RoundedRectangle(cornerRadius: DS.Radius.m))
            .overlay(
                RoundedRectangle(cornerRadius: DS.Radius.m)
                    .stroke(Color.DS.stroke, lineWidth: DS.Size.hairline)
            )
    }
}
```

Call site: `DSCard { Text("Hello").designSystem(font: .body) }`.

### Components to add at kickoff (NOT shipped — build them when a slice needs them)

These are the usual next bricks. They do **not** exist in the skeleton — add the file, then use the
API. Don't call any of them before you've written it (the compiler will tell you, but the doc won't
pretend they're there):

- **`DSBackground` + `.dsBackground()`** — `ZStack { Color.DS.background; radial accent glows }.ignoresSafeArea()`,
  exposed as a `.dsBackground()` modifier that wraps content in a `ZStack` (background behind, content
  stays in safe area). Gotcha to anticipate: applying it via plain `.background(DSBackground())` clips
  the glows to the view's bounds — wrap in a `ZStack` and let `DSBackground` call `.ignoresSafeArea()`
  so consumers never manage safe areas for the backdrop.
- **`GlassCard { … }`** — a heavier card than `DSCard`: `surface` fill, `Radius.l` continuous corners,
  `stroke` hairline border, optional iOS 26 glass effect.
- **Semantic button styles** — `DSPrimaryButtonStyle` / `DSSecondaryButtonStyle`, exposed via
  `static var dsPrimary` / `dsSecondary` on `ButtonStyle` so call sites read `.buttonStyle(.dsPrimary)`.

Add each as its own file under `Components/`, token-only, with a `#Preview`. Once it exists it's a
first-class part of the vocabulary above.

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


> Note — this doc describes ONLY what `Packages/{{PROJECT_NAME}}DS/Sources/{{PROJECT_NAME}}DS/`
> actually ships (the four token files + `Components/DSCard.swift`). Everything under "Components to
> add at kickoff" is a future addition, not an existing API. If code and doc ever disagree, THE
> SCAFFOLD FILES ARE THE TRUTH — extend them rather than rewriting them to match prose.
