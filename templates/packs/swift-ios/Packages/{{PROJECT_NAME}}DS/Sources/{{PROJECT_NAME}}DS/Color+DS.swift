import SwiftUI

/// Semantic palette. Dark-first. Rename/extend at kickoff — never bypass with raw values.
public extension Color {
    enum DS {
        public static let accent = Color(red: 0.35, green: 0.45, blue: 1.00)
        public static let accentSecondary = Color(red: 0.55, green: 0.30, blue: 0.95)
        public static let background = Color(red: 0.039, green: 0.039, blue: 0.059)
        public static let surface = Color.white.opacity(0.06)
        public static let surfaceStrong = Color.white.opacity(0.10)
        public static let stroke = Color.white.opacity(0.12)
        public static let textPrimary = Color.white
        public static let textSecondary = Color.white.opacity(0.6)
        public static let textTertiary = Color.white.opacity(0.4)
        public static let success = Color(red: 0.20, green: 0.85, blue: 0.45)
        public static let danger = Color(red: 1.00, green: 0.27, blue: 0.36)
    }
}
