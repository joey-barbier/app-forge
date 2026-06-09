import SwiftUI

public extension DS {
    /// Typography scale. Use through `.designSystem(font:)` — never `.font(.system(...))` in app code.
    enum Font {
        case largeTitle, title, h2, h3, body, callout, caption, button, mono

        var font: SwiftUI.Font {
            switch self {
            case .largeTitle: .system(size: 34, weight: .bold)
            case .title: .system(size: 28, weight: .bold)
            case .h2: .system(size: 22, weight: .semibold)
            case .h3: .system(size: 17, weight: .semibold)
            case .body: .system(size: 17)
            case .callout: .system(size: 15)
            case .caption: .system(size: 12)
            case .button: .system(size: 17, weight: .semibold)
            case .mono: .system(size: 15, design: .monospaced)
            }
        }
    }
}

public extension View {
    func designSystem(font: DS.Font) -> some View { self.font(font.font) }
}
