import Foundation

/// Sample domain entity — replace at kickoff. Shows the conventions:
/// value type, Identifiable + Sendable, explicit dates injected (never read the clock here).
public struct SampleItem: Identifiable, Hashable, Sendable {
    public let id: UUID
    public var title: String
    public var createdAt: Date

    public init(id: UUID = UUID(), title: String, createdAt: Date) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
    }
}
