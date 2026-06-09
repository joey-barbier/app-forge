import Fluent
import Foundation

extension App.Item {
    /// L2 — DATA ACCESS ONLY. A repository answers "what does the database say" and
    /// nothing else: no validation, no normalization, no typed business errors, no
    /// orchestration. All of that lives in Service (L3). If a method here starts making
    /// decisions, it is in the wrong layer.
    struct Repository: Sendable {
        let db: any Database

        func all() async throws -> Entities {
            try await Entity.query(on: db)
                .sort(\.$name)
                .all()
        }

        func find(_ id: UUID) async throws -> Entity? {
            try await Entity.find(id, on: db)
        }

        func exists(name: String) async throws -> Bool {
            try await Entity.query(on: db)
                .filter(\.$name == name)
                .count() > 0
        }

        func save(_ entity: Entity) async throws {
            try await entity.save(on: db)
        }
    }
}
