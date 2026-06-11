import Fluent

extension App.Item.Migrations {
    /// Schema changes are append-only: never edit a shipped migration — add a new one
    /// (`AddXxx`, `FixXxx`) and list it after this one in AppItem.swift.
    struct Create: AsyncMigration {
        typealias Entity = App.Item.Entity

        func prepare(on database: any Database) async throws {
            try await database.schema(Entity.schema)
                .id()
                .field("name", .string, .required)
                .field("created_at", .datetime)
                // Name uniqueness is enforced by the DATABASE, not by a check-then-insert in
                // the service (that read+write is a TOCTOU race under concurrency). The Service
                // still pre-checks for a clean 409, but this constraint is the source of truth.
                .unique(on: "name")
                .create()
        }

        func revert(on database: any Database) async throws {
            try await database.schema(Entity.schema).delete()
        }
    }
}
