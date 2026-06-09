import Fluent
import Foundation
import {{PROJECT_NAME}}Foundation

extension App.Item {
    /// L3 — BUSINESS LOGIC for the Item feature. The only layer that makes decisions:
    /// validation, normalization, typed errors, multi-step orchestration.
    /// Controllers translate HTTP ↔ DTO and call the service; the repository only
    /// touches the database. Services never see `Request` — they take plain values,
    /// which keeps them testable without HTTP.
    struct Service: Sendable {
        let repository: Repository

        init(db: any Database) {
            self.repository = Repository(db: db)
        }

        func list() async throws -> Entities {
            try await repository.all()
        }

        func get(_ id: UUID) async throws -> Entity {
            guard let entity = try await repository.find(id) else {
                throw App.Failed.NotFound.dataNotFound
            }
            return entity
        }

        /// Business rules: names are stored trimmed, must not be blank, must be unique.
        func create(name: String) async throws -> Entity {
            let cleanName = name.trimmed

            guard !cleanName.isEmpty else {
                throw App.Failed.BadRequest.dataNotValid
            }
            guard try await repository.exists(name: cleanName) == false else {
                throw App.Failed.Conflict.dataAlreadyExist
            }

            let entity = Entity(name: cleanName)
            try await repository.save(entity)
            return entity
        }
    }
}
