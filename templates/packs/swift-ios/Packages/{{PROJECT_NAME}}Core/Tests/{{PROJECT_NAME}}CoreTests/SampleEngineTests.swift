import Foundation
import Testing
@testable import {{PROJECT_NAME}}Core

/// Swift Testing (@Test/#expect), deterministic dates via a Fixture helper. This is the pattern
/// every engine test follows. Delete alongside SampleEngine at kickoff.
@Suite struct SampleEngineTests {
    private static func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var components = DateComponents()
        (components.year, components.month, components.day) = (year, month, day)
        return Calendar(identifier: .gregorian).date(from: components)!
    }

    @Test func sameDayFilterKeepsOnlyMatchingItems() {
        let monday = Self.date(2026, 6, 1)
        let tuesday = Self.date(2026, 6, 2)
        let items = [
            SampleItem(title: "a", createdAt: monday),
            SampleItem(title: "b", createdAt: tuesday),
        ]
        let result = SampleEngine.items(items, onSameDayAs: monday)
        #expect(result.map(\.title) == ["a"])
    }
}
