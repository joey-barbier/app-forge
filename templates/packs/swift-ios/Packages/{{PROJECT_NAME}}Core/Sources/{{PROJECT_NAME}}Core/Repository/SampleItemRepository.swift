import Foundation

/// Sample repository pair — replace at kickoff. The pattern (see docs-architecture/ARCHITECTURE.md §2):
/// the CONTRACT and the InMemory reference implementation live HERE in Core (testable without IO
/// frameworks); the real backend implementation (CloudKit/network) lives in DataLayer and imports
/// this protocol — the one sanctioned upward arrow (ports & adapters).
public protocol SampleItemRepository: Sendable {
    func loadItems() async throws -> [SampleItem]
    func save(_ item: SampleItem) async throws
}

/// Backs tests, previews and offline-first development.
public actor InMemorySampleItemRepository: SampleItemRepository {
    private var items: [SampleItem] = []

    public init() {}

    public func loadItems() async throws -> [SampleItem] { items }

    public func save(_ item: SampleItem) async throws {
        if let index = items.firstIndex(where: { $0.id == item.id }) {
            items[index] = item          // update in place — keeps stable order
        } else {
            items.append(item)
        }
    }
}
