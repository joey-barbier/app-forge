import Fluent
import Vapor

extension App {
    /// REFERENCE FEATURE MODULE — copy this shape for every new feature.
    ///
    /// A feature module is one folder under `Features/` holding everything the feature
    /// needs, split by role: Controllers (L5), DTO (L5), Services (L3), Entities (L3),
    /// Repositories (L2), Migrations (L2), Jobs (L2, when needed).
    ///
    /// This file is the module's front door: the namespace + its registration surfaces.
    /// Wiring a feature into the app takes exactly two lines elsewhere:
    /// - `try App.Item.Controllers.register(app: app)` in Configure/routes.swift
    /// - `App.Item.Migrations.register(app: app)` in Configure/configure.swift (ORDER MATTERS)
    enum Item {
        enum Controllers {}
        enum Migrations {}
        enum DTO {}
    }
}

// MARK: - Controllers
extension App.Item.Controllers: ControllersRegister {
    static func allCases() -> [any RouteCollection] {
        [
            Crud()
        ]
    }
}

// MARK: - Migrations
extension App.Item.Migrations: MigrationsRegister {
    static func allCases() -> [any Migration] {
        [
            Create()
        ]
    }
}
