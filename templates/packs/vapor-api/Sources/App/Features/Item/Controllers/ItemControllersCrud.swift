import Fluent
import Vapor

extension App.Item.Controllers {
    /// L5 — HTTP boundary only: decode DTO.Input, call the Service, encode DTO.Output.
    /// No Fluent queries here, no business rules — if a guard encodes a domain decision,
    /// it belongs in the Service.
    struct Crud: RouteCollection {
        func boot(routes: any RoutesBuilder) throws {
            let items = routes.grouped("api", "items")
            items.get(use: index)
            items.post(use: create)
            items.get(":itemID", use: get)
        }

        @Sendable
        func index(req: Request) async throws -> [App.Item.DTO.Output] {
            try await App.Item.Service(db: req.db)
                .list()
                .map { try App.Item.DTO.Output(entity: $0) }
        }

        @Sendable
        func get(req: Request) async throws -> App.Item.DTO.Output {
            guard let id = req.parameters.get("itemID", as: UUID.self) else {
                throw App.Failed.BadRequest.idNotFound
            }
            let entity = try await App.Item.Service(db: req.db).get(id)
            return try App.Item.DTO.Output(entity: entity)
        }

        @Sendable
        func create(req: Request) async throws -> App.Item.DTO.Output {
            guard let input = try? req.content.decode(App.Item.DTO.Input.self) else {
                throw App.Failed.BadRequest.jsonNotDecodable
            }
            let entity = try await App.Item.Service(db: req.db).create(name: input.name)
            return try App.Item.DTO.Output(entity: entity)
        }
    }
}
