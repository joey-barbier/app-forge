import SwiftUI

/// Design system namespace. ALL visual tokens live here — app code never hardcodes values.
public enum DS {
    /// Responsive scaling hook (1.0 for now; derive from screen size later if needed).
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

    /// Signature gradients — customize at kickoff to match the app's brand.
    public enum Gradients {
        public static let brand = LinearGradient(
            colors: [Color.DS.accent, Color.DS.accentSecondary],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}
