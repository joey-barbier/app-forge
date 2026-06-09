import Fluent
import Vapor

extension App.Item {
    typealias Entities = [Entity]

    /// Fluent model. `@unchecked Sendable` is the Fluent-imposed exception to the
    /// no-unchecked rule — property wrappers make models mutable reference types.
    /// CONTAINMENT RULE: an Entity never crosses a concurrency boundary and never leaves
    /// the request scope — map to DTO.Output at the controller edge
    /// (docs-architecture/GOTCHAS_LINUX_SWIFT.md).
    final class Entity: Model, @unchecked Sendable {
        static let schema = "items"

        @ID(key: .id)
        var id: UUID?

        @Field(key: "name")
        var name: String

        @Timestamp(key: "created_at", on: .create)
        var createdAt: Date?

        init() { }

        init(name: String) {
            self.name = name
        }
    }
}
