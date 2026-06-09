import Foundation
import {{PROJECT_NAME}}Core

/// Sample repository pair — replace at kickoff. The pattern: a protocol the Store depends on,
/// an InMemory implementation (previews/tests/offline-first dev), and later a CloudKit/network
/// implementation behind the same protocol (see docs-architecture/CLOUDKIT_GUIDE.md).
public protocol SampleItemRepository: Sendable {
    func loadItems() async throws -> [SampleItem]
    func save(_ item: SampleItem) async throws
}

public actor InMemorySampleItemRepository: SampleItemRepository {
    private var items: [SampleItem] = []

    public init() {}

    public func loadItems() async throws -> [SampleItem] { items }

    public func save(_ item: SampleItem) async throws {
        items.removeAll { $0.id == item.id }
        items.append(item)
    }
}
