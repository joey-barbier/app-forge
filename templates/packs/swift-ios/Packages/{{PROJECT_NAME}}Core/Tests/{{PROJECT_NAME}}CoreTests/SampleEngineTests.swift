import Foundation
import Testing
@testable import {{PROJECT_NAME}}Core

/// Swift Testing (@Test/#expect), deterministic dates via a Fixture helper. This is the pattern
/// every engine test follows. Delete alongside SampleEngine at kickoff.
@Suite struct SampleEngineTests {
    /// Fixed Gregorian/UTC calendar — never `Calendar.current` (its timezone moves day boundaries
    /// between machines/CI and makes hour/day-boundary tests flaky). Inject it everywhere.
    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    private static func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var components = DateComponents()
        (components.year, components.month, components.day) = (year, month, day)
        return calendar.date(from: components)!
    }

    @Test func sameDayFilterKeepsOnlyMatchingItems() {
        let monday = Self.date(2026, 6, 1)
        let tuesday = Self.date(2026, 6, 2)
        let items = [
            SampleItem(title: "a", createdAt: monday),
            SampleItem(title: "b", createdAt: tuesday),
        ]
        let result = SampleEngine.items(items, onSameDayAs: monday, calendar: Self.calendar)
        #expect(result.map(\.title) == ["a"])
    }
}
