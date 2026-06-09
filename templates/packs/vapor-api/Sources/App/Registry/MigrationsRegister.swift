import Fluent
import Vapor

/// Auto-registration surface for a feature module's migrations.
///
/// `allCases()` order = execution order WITHIN the feature. Order ACROSS features is
/// decided by the explicit `register` call sequence in `configure.swift` — that ordering
/// is load-bearing (foreign keys), see docs-architecture/GOTCHAS_LINUX_SWIFT.md.
protocol MigrationsRegister {
    static func allCases() -> [any Migration]
    static func register(app: Application)
}

extension MigrationsRegister {
    static func register(app: Application) {
        allCases().forEach { app.migrations.add($0) }
    }
}
