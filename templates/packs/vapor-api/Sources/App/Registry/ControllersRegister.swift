import Vapor

/// Auto-registration surface for a feature module's controllers.
///
/// A feature conforms its `Controllers` namespace enum and lists its RouteCollections in
/// `allCases()`; `routes.swift` then needs exactly ONE line per feature:
/// `try App.<Feature>.Controllers.register(app: app)`.
protocol ControllersRegister {
    static func allCases() -> [any RouteCollection]
    static func register(app: Application) throws
}

extension ControllersRegister {
    static func register(app: Application) throws {
        try allCases().forEach { try app.register(collection: $0) }
    }
}
