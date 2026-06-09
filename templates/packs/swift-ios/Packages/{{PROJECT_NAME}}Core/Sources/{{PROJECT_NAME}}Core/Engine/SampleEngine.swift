import Foundation

/// Sample pure engine — replace at kickoff. Conventions on display:
/// `enum` (no instances), nonisolated pure functions, `Calendar` injected for determinism.
public enum SampleEngine {
    /// Items created on the same calendar day as `reference`.
    public static func items(
        _ items: [SampleItem],
        onSameDayAs reference: Date,
        calendar: Calendar = .current
    ) -> [SampleItem] {
        items.filter { calendar.isDate($0.createdAt, inSameDayAs: reference) }
    }
}
