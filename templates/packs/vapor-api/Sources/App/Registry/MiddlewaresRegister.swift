import Vapor

/// Auto-registration surface for a feature module's global middlewares.
/// Used sparingly — most features need none. The typed-error handler (App.Failed) is the
/// canonical conformer.
protocol MiddlewaresRegister {
    static func allCases() -> [any Middleware]
    static func register(app: Application)
}

extension MiddlewaresRegister {
    static func register(app: Application) {
        allCases().forEach { app.middleware.use($0) }
    }
}
