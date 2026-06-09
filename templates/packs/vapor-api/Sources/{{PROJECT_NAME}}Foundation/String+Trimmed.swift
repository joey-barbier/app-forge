import Foundation

// L0 helper — primitives only. This target depends on nothing; keep it that way.
public extension String {
    /// Whitespace/newline-trimmed copy. Services normalize user input with this
    /// before persisting (storage rule: names are stored trimmed).
    var trimmed: String {
        trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// True when the string is empty after trimming.
    var isBlank: Bool {
        trimmed.isEmpty
    }
}
