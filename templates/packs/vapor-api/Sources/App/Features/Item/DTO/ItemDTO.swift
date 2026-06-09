import Vapor

extension App.Item.DTO {
    /// Wire types. Entities NEVER serialize directly — the DTO is the public contract,
    /// the entity is a private persistence detail (renaming a column must not be an
    /// API-breaking change).
    struct Input: Content {
        let name: String
    }

    struct Output: Content {
        let id: UUID
        let name: String
        let createdAt: Date?

        init(entity: App.Item.Entity) throws {
            self.id = try entity.requireID()
            self.name = entity.name
            self.createdAt = entity.createdAt
        }
    }
}
